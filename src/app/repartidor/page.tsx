"use client";

import { apiFetch } from "@/lib/apiClient";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";
import { usePreferences } from '@/lib/preferences';
import { isCourierLocationFresh } from "@/lib/courierLocation";
import { Queue } from "@/core/structures/Queue";
import { SessionChangeNotice } from "@/components/SessionChangeNotice";
import type { MapTrafficMark } from "@/components/MapLibreRouteMap";
import { nearestStopsByEta, type StopEta } from "@/lib/etaHeap";
import { OfflineQueue } from "@/lib/offlineQueue";
import Sheet, { type SheetLayout } from "@/components/Sheet";
import type { MapInset } from "@/components/MapLibreRouteMap";

const CourierRouteMap = dynamic(() => import("./CourierRouteMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#17242b] text-sm text-slate-300">
      Cargando mapa de tu ruta…
    </div>
  ),
});

const MIN_UPDATE_INTERVAL_MS = 5_000;
// Cola acotada: si la red se degrada, se descartan las posiciones más antiguas.
const MAX_PENDING_LOCATIONS = 20;
const NAVIGATION_REFRESH_INTERVAL_MS = 15_000;
// Revisión automática: solo consulta tráfico y propone; no cambia el orden guardado.
const PROPOSAL_REFRESH_INTERVAL_MS = 5_000;
const CELEBRATION_MS = 3_200;
// Optimización automática: solo se aplica un reorden con ahorro real y no más de uno cada 30 s.
const AUTO_MIN_SAVING_MINUTES = 1;
const AUTO_COOLDOWN_MS = 30_000;
const ETA_REFRESH_INTERVAL_MS = 15_000;
const OFFLINE_RETRY_INTERVAL_MS = 10_000;

interface DeliveryUpdate {
  deliveryPointId: string;
  status: "DELIVERED" | "FAILED";
}

interface LastLocation {
  lat: number;
  lng: number;
  recordedAt: string;
}

interface NavigationSnapshot {
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  };
  distanceMeters: number;
  durationMinutes: number;
  source: "osrm" | "ors";
  geometryProvider: "OSRM" | "ORS";
  nextDeliveryPointId: string;
  remainingDeliveryPointIds: string[];
  warning?: string;
}

interface AssignedRoute {
  id: string;
  status: "PLANNED" | "IN_PROGRESS";
  optimizedAt?: string | null;
  estimatedDurationMinutes?: number;
  courier: {
    currentLat: number | null;
    currentLng: number | null;
  };
  geometryProvider: "OSRM" | "ORS" | null;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  } | null;
  deliveryPoints: Array<{
    id: string;
    address: string;
    lat: number;
    lng: number;
    sequenceIndex: number | null;
    status: "PENDING" | "EN_ROUTE" | "DELIVERED" | "FAILED";
  }>;
}

interface AiOrder {
  proposed: boolean;
  accepted: boolean;
  savingMinutes?: number;
  reason?: string;
  verifiedWith?: string;
}

interface RouteProposal {
  aiOrder?: AiOrder;
  orderedDeliveryPointIds: string[];
  changed: boolean;
  worthApplying?: boolean;
  baselineDurationMinutes?: number | null;
  estimatedDurationMinutes: number;
  improvementMinutes: number | null;
  computedAt: string;
  cached: boolean;
  warning?: string | null;
}

interface TrafficObservation extends MapTrafficMark {
  observedAt: string;
}

interface AppliedOptimization {
  at: number;
  auto: boolean;
  savedMinutes: number | null;
  fromMinutes: number | null;
  toMinutes: number | null;
}

interface CourierProfile {
  status: "AVAILABLE" | "ON_ROUTE" | "OFFLINE";
  currentLat: number | null;
  currentLng: number | null;
  lastLocationAt: string | null;
}

/** Resume las mediciones de TomTom sin mezclar cobertura de toda la ciudad con la ruta. */
function summarizeTraffic(marks: TrafficObservation[]): string {
  const counts = { closed: 0, heavy: 0, moderate: 0, free: 0 };
  for (const mark of marks) {
    if (mark.roadClosure || mark.trafficLevel === "CERRADO") counts.closed += 1;
    else if (mark.trafficLevel === "ALTO" || mark.trafficLevel === "MUY_ALTO") counts.heavy += 1;
    else if (mark.trafficLevel === "MODERADO") counts.moderate += 1;
    else if (mark.trafficLevel === "FLUIDO") counts.free += 1;
  }
  const parts = [
    counts.closed ? `${counts.closed} cerrado` : "",
    counts.heavy ? `${counts.heavy} con mucho tráfico` : "",
    counts.moderate ? `${counts.moderate} moderado` : "",
    counts.free ? `${counts.free} fluido` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "sin mediciones claras";
}

export default function RepartidorPage() {
  const { t } = usePreferences();
  const [courierStatus, setCourierStatus] = useState<CourierProfile["status"]>("OFFLINE");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null);
  const [assignedRoute, setAssignedRoute] = useState<AssignedRoute | null>(null);
  const [navigation, setNavigation] = useState<NavigationSnapshot | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<RouteProposal | null>(null);
  const [proposalStatus, setProposalStatus] = useState<string | null>(null);
  const [trafficMarks, setTrafficMarks] = useState<TrafficObservation[]>([]);
  const [applying, setApplying] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);
  const proposalInFlight = useRef(false);
  const [dismissedProposal, setDismissedProposal] = useState<string | null>(null);
  const [autoOptimize, setAutoOptimize] = useState(true);
  const [optimizations, setOptimizations] = useState<AppliedOptimization[]>([]);
  const [lastReviewAt, setLastReviewAt] = useState<number | null>(null);
  const lastAutoAt = useRef(0);
  const autoReview = useRef<(candidate: RouteProposal) => void>(() => undefined);
  const [stopEtas, setStopEtas] = useState<StopEta[]>([]);
  const [historySimulated, setHistorySimulated] = useState(false);
  // Cola FIFO: las entregas marcadas sin conexión se reenvían en orden al recuperarla.
  const [offlineUpdates] = useState(() => new OfflineQueue<DeliveryUpdate>());
  const [pendingUpdates, setPendingUpdates] = useState(0);
  const routeGeneration = useRef(0);
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);
  const pendingLocations = useRef(new Queue<LastLocation>());
  const isSendingLocations = useRef(false);
  const activeDeliveryPoints =
    assignedRoute?.deliveryPoints.filter(
      (point) => point.status === "PENDING" || point.status === "EN_ROUTE",
    ) ?? [];

  const loadCourierProfile = useCallback(async (): Promise<void> => {
    setLoadingProfile(true);

    try {
      const response = await apiFetch("/api/repartidores/me", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo validar tu sesión."));
      }

      const payload = (await response.json()) as { courier: CourierProfile };
      setCourierStatus(payload.courier.status);
      setLastLocation(
        payload.courier.currentLat !== null &&
          payload.courier.currentLng !== null &&
          payload.courier.lastLocationAt
          ? {
              lat: payload.courier.currentLat,
              lng: payload.courier.currentLng,
              recordedAt: payload.courier.lastLocationAt,
            }
          : null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo validar tu sesión.",
      );
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const refreshNavigation = useCallback(async (routeId: string): Promise<void> => {
    const generation = routeGeneration.current;
    const response = await apiFetch(`/api/rutas/${encodeURIComponent(routeId)}/navegacion`, {
      cache: "no-store",
    });
    if (generation !== routeGeneration.current) return;

    if (!response.ok) {
      throw new Error(await readApiError(response, "No se pudo actualizar la navegación."));
    }

    const payload = (await response.json()) as {
      navigation: NavigationSnapshot | null;
    };
    if (generation !== routeGeneration.current) return;
    setNavigation(payload.navigation);
    setNavigationError(null);

    if (payload.navigation) {
      setAssignedRoute((currentRoute) =>
        currentRoute?.id === routeId
          ? {
              ...currentRoute,
              geometry: payload.navigation!.geometry,
              geometryProvider: payload.navigation!.geometryProvider,
              deliveryPoints: currentRoute.deliveryPoints
                .map((point) => {
                  const index = payload.navigation!.remainingDeliveryPointIds.indexOf(point.id);
                  return index < 0 ? point : { ...point, sequenceIndex: index };
                })
                .sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0)),
            }
          : currentRoute,
      );
    }
  }, []);

  const loadAssignedRoute = useCallback(async (): Promise<void> => {
    const generation = routeGeneration.current;
    try {
      const response = await apiFetch("/api/rutas", { cache: "no-store" });
      if (generation !== routeGeneration.current) return;

      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo cargar la ruta asignada."));
      }

      const payload = (await response.json()) as { routes: AssignedRoute[] };
      if (generation !== routeGeneration.current) return;
      const route = payload.routes.find(
        (candidate) =>
          candidate.status === "PLANNED" || candidate.status === "IN_PROGRESS",
      ) ?? null;

      setAssignedRoute(route);
      setNavigation(null);

      if (route) {
        void refreshNavigation(route.id).catch((navigationError) => {
          setNavigationError(
            navigationError instanceof Error
              ? navigationError.message
              : "No se pudo actualizar la ruta vial; se conserva solo la geometría vial guardada.",
          );
        });
      } else {
        setNavigationError(null);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la ruta asignada. Recupera la conexión e inténtalo de nuevo.",
      );
    }
  }, [refreshNavigation]);

  const sendDeliveryStatus = useCallback(async ({ deliveryPointId, status }: DeliveryUpdate): Promise<void> => {
    const response = await apiFetch(`/api/pedidos/${encodeURIComponent(deliveryPointId)}`, {
      body: JSON.stringify({ status }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });
    if (!response.ok) {
      throw new Error(await readApiError(response, "No se pudo actualizar la entrega."));
    }
  }, []);

  const flushOfflineUpdates = useCallback(async (): Promise<void> => {
    if (offlineUpdates.size === 0) return;
    const sent = await offlineUpdates.flush(sendDeliveryStatus);
    setPendingUpdates(offlineUpdates.size);
    if (sent > 0) await loadAssignedRoute();
  }, [loadAssignedRoute, offlineUpdates, sendDeliveryStatus]);

  const applyProposal = async (auto = false, source: RouteProposal | null = proposal): Promise<void> => {
    if (!assignedRoute || applying) return;
    routeGeneration.current += 1;
    setApplying(true);
    setError(null);
    try {
      const response = await apiFetch(`/api/rutas/${encodeURIComponent(assignedRoute.id)}/recalcular`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!response.ok) throw new Error(await readApiError(response, "No se pudo aplicar la ruta optimizada."));
      const result = (await response.json()) as { route: AssignedRoute };
      setAssignedRoute(result.route);
      setNavigation(null);
      setNavigationError(null);
      setProposal(null);
      const saved = source?.improvementMinutes ?? null;
      setOptimizations((current) => [
        ...current.slice(-19),
        {
          at: Date.now(),
          auto,
          savedMinutes: saved !== null && saved > 0 ? saved : null,
          fromMinutes: source?.baselineDurationMinutes ?? null,
          toMinutes: source?.estimatedDurationMinutes ?? null,
        },
      ]);
      setAppliedNotice(
        auto
          ? `Ruta optimizada automáticamente${saved !== null && saved >= 1 ? `: ahorras unos ${Math.round(saved)} min` : ""}. El nuevo orden ya está en tu lista.`
          : "Ruta optimizada aplicada: el orden de tus paradas ya está actualizado.",
      );
      setCelebrating(true);
      void refreshNavigation(result.route.id).catch(() => undefined);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "No se pudo aplicar la ruta optimizada.");
    } finally {
      routeGeneration.current += 1;
      setApplying(false);
    }
  };

  autoReview.current = (candidate: RouteProposal) => {
    const worth = candidate.worthApplying ?? candidate.changed;
    const saving = candidate.improvementMinutes ?? candidate.aiOrder?.savingMinutes ?? 0;
    if (
      !autoOptimize ||
      applying ||
      !assignedRoute ||
      !worth ||
      saving < AUTO_MIN_SAVING_MINUTES ||
      activeDeliveryPoints.length < 2 ||
      candidate.orderedDeliveryPointIds.join(",") === dismissedProposal ||
      Date.now() - lastAutoAt.current < AUTO_COOLDOWN_MS
    ) {
      return;
    }
    lastAutoAt.current = Date.now();
    void applyProposal(true, candidate);
  };

  useEffect(() => {
    // Retira identificadores y rutas privadas almacenados por versiones antiguas de la PWA.
    window.localStorage.removeItem("rutas-pasto:courier-id");
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("rutas-pasto:assigned-route:")) {
        window.localStorage.removeItem(key);
      }
    }
    void loadCourierProfile();
    void loadAssignedRoute();

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [loadAssignedRoute, loadCourierProfile]);

  useEffect(() => {
    if (!celebrating) return;
    const timeout = window.setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => window.clearTimeout(timeout);
  }, [celebrating]);

  // Cada 5 s revisa tráfico (TomTom) y propone la mejor ruta (IA); el backend cachea la propuesta.
  useEffect(() => {
    const routeId = assignedRoute?.id;
    if (routeId === undefined) {
      setProposal(null);
      setTrafficMarks([]);
      setProposalStatus(null);
      return;
    }
    let disposed = false;
    const review = async () => {
      if (document.visibilityState === "hidden" || proposalInFlight.current) return;
      proposalInFlight.current = true;
      try {
        const encodedId = encodeURIComponent(routeId);
        const [proposalResponse, trafficResponse] = await Promise.all([
          apiFetch(`/api/rutas/${encodedId}/propuesta`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
          }),
          apiFetch(`/api/rutas/${encodedId}/trafico-vivo`, { cache: "no-store" }),
        ]);
        if (disposed) return;
        if (proposalResponse.ok) {
          const payload = (await proposalResponse.json()) as RouteProposal;
          setProposal(payload);
          setLastReviewAt(Date.now());
          autoReview.current(payload);
          setProposalStatus(
            payload.changed
              ? null
              : `Ruta revisada a las ${new Date(payload.computedAt).toLocaleTimeString("es-CO")}: el orden actual es el mejor con el tráfico de ahora.`,
          );
        } else {
          setProposalStatus(await readApiError(proposalResponse, "No se pudo revisar la ruta con tráfico."));
        }
        if (trafficResponse.ok) {
          const overlay = (await trafficResponse.json()) as { observations?: TrafficObservation[] };
          setTrafficMarks(overlay.observations ?? []);
        } else {
          setTrafficMarks([]);
        }
      } catch {
        if (!disposed) setProposalStatus("Sin conexión para revisar la ruta; se conserva la última propuesta.");
      } finally {
        proposalInFlight.current = false;
      }
    };
    void review();
    const interval = window.setInterval(() => void review(), PROPOSAL_REFRESH_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [assignedRoute?.id]);

  // Reintenta la cola de entregas pendientes al recuperar la red y cada 10 s mientras haya.
  useEffect(() => {
    const retry = () => void flushOfflineUpdates();
    window.addEventListener("online", retry);
    const interval = window.setInterval(retry, OFFLINE_RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(interval);
    };
  }, [flushOfflineUpdates]);

  // ETA por parada cada 15 s; el min-heap elige las más cercanas.
  useEffect(() => {
    const routeId = assignedRoute?.id;
    if (routeId === undefined) {
      setStopEtas([]);
      return;
    }
    let disposed = false;
    const loadEtas = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await apiFetch(`/api/rutas/${encodeURIComponent(routeId)}/eta`, { cache: "no-store" });
        if (!response.ok || disposed) return;
        const payload = (await response.json()) as {
          etas?: StopEta[];
          historical?: { simulatedShare?: number } | null;
        };
        if (!disposed) {
          setStopEtas(payload.etas ?? []);
          setHistorySimulated((payload.historical?.simulatedShare ?? 0) >= 0.5);
        }
      } catch {
        // Se conserva el último cálculo válido.
      }
    };
    void loadEtas();
    const interval = window.setInterval(() => void loadEtas(), ETA_REFRESH_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [assignedRoute?.id]);

  useEffect(() => {
    const handleOnline = () => {
      void loadCourierProfile();
      void loadAssignedRoute();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [loadAssignedRoute, loadCourierProfile]);

  useEffect(() => {
    if (!lastLocation) {
      return;
    }

    const expireStalePosition = () => {
      if (!isCourierLocationFresh(new Date(lastLocation.recordedAt))) {
        setLastLocation(null);
      }
    };
    const interval = window.setInterval(expireStalePosition, 15_000);
    return () => window.clearInterval(interval);
  }, [lastLocation]);

  useEffect(() => {
    const routeId = assignedRoute?.id;
    const shouldRefresh =
      routeId !== undefined &&
      (assignedRoute?.status === "IN_PROGRESS" || isTracking);

    if (!shouldRefresh || routeId === undefined || applying) {
      return;
    }

    const refresh = () => {
      void refreshNavigation(routeId).catch(() => {
        // La última geometría válida permanece visible durante un fallo puntual.
      });
    };
    const interval = window.setInterval(refresh, NAVIGATION_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [assignedRoute?.id, assignedRoute?.status, isTracking, applying, refreshNavigation]);

  const stopTracking = async () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    pendingLocations.current.clear();
    setIsTracking(false);
    try {
      const response = await apiFetch("/api/repartidores/me/ubicacion", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo actualizar el estado."));
      }
      const payload = (await response.json()) as { courier: { status: CourierProfile["status"] } };
      setCourierStatus(payload.courier.status);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "El GPS se detuvo en el dispositivo, pero no se confirmó con el servidor.");
    }
  };

  const updateRouteStatus = async (status: "IN_PROGRESS" | "COMPLETED") => {
    if (!assignedRoute) {
      return;
    }

    try {
      const response = await apiFetch(`/api/rutas/${encodeURIComponent(assignedRoute.id)}`, {
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo actualizar la ruta."));
      }

      setError(null);
      await loadAssignedRoute();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar la ruta.");
    }
  };

  const updateDeliveryStatus = async (
    deliveryPointId: string,
    status: "DELIVERED" | "FAILED",
  ) => {
    try {
      await sendDeliveryStatus({ deliveryPointId, status });
      setError(null);
      await loadAssignedRoute();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "";
      if (!navigator.onLine || /conectar|tardó demasiado/.test(message)) {
        offlineUpdates.enqueue({ deliveryPointId, status });
        setPendingUpdates(offlineUpdates.size);
        setError("Sin conexión: guardamos tu entrega y la enviaremos al recuperar la señal.");
        return;
      }
      setError(message || "No se pudo actualizar la entrega.");
    }
  };

  // Envía las posiciones en orden FIFO, de una en una, para que el backend no rechace
  // lecturas antiguas que llegan después de las nuevas.
  const sendQueuedLocations = async () => {
    if (isSendingLocations.current) {
      return;
    }
    isSendingLocations.current = true;
    try {
      for (
        let next = pendingLocations.current.dequeue();
        next !== undefined;
        next = pendingLocations.current.dequeue()
      ) {
        const result = await sendLocation(next);
        if (result.accepted) {
          setLastLocation(next);
          setCourierStatus(assignedRoute ? "ON_ROUTE" : "AVAILABLE");
          setError(null);
        } else if (result.error) {
          setError(result.error);
        }
      }
    } finally {
      isSendingLocations.current = false;
    }
  };

  const enqueueLocation = (location: LastLocation) => {
    const queue = pendingLocations.current;
    if (queue.size() >= MAX_PENDING_LOCATIONS) {
      queue.dequeue();
    }
    queue.enqueue(location);
    void sendQueuedLocations();
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Este dispositivo no permite obtener la ubicación.");
      return;
    }

    setError(null);
    void loadAssignedRoute();
    lastSentAt.current = 0;

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const recordedAt = new Date(position.timestamp).toISOString();
        const now = Date.now();

        if (now - lastSentAt.current < MIN_UPDATE_INTERVAL_MS) {
          return;
        }

        lastSentAt.current = now;
        enqueueLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          recordedAt,
        });
      },
      (positionError) => {
        setError(formatGeolocationError(positionError));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 10_000,
      },
    );

    setIsTracking(true);
  };

  const nextStop = navigation
    ? activeDeliveryPoints.find((point) => point.id === navigation.nextDeliveryPointId)
    : undefined;
  const nearest = nearestStopsByEta(stopEtas, 3);

  const [inset, setInset] = useState<MapInset | undefined>(undefined);
  const [stageWide, setStageWide] = useState(false);
  const handleSheetLayout = useCallback((layout: SheetLayout) => {
    setStageWide(layout.wide);
    setInset((current) =>
      current &&
      current.top === layout.inset.top &&
      current.right === layout.inset.right &&
      current.bottom === layout.inset.bottom &&
      current.left === layout.inset.left
        ? current
        : layout.inset
    );
  }, []);

  const gpsButton = isTracking ? (
    <button className="rp-button rp-button-danger rp-button-small shrink-0" data-tip="tip.stopGps" onClick={stopTracking} type="button">
      {t("courier.stopGps")}
    </button>
  ) : (
    <button
      className="rp-button rp-button-go rp-button-small shrink-0"
      data-tip="tip.startGps"
      disabled={loadingProfile}
      onClick={startTracking}
      type="button"
    >
      {t("courier.startGps")}
    </button>
  );
  const currentStop = activeDeliveryPoints[0];
  const canResolveCurrent =
    assignedRoute?.status === "IN_PROGRESS" &&
    currentStop !== undefined &&
    (currentStop.status === "PENDING" || currentStop.status === "EN_ROUTE");
  // Acción principal en la zona del pulgar: la parada que toca y cómo cerrarla.
  const sheetFoot = assignedRoute ? (
    <div className="grid gap-2">
      {navigation ? (
        <div className="rl-board !p-3">
          <p className="text-xs font-semibold !text-[var(--board-soft)]">
            {t("courier.nav")} · <span className="tabular-nums">{formatDistance(navigation.distanceMeters)} · {Math.max(1, Math.round(navigation.durationMinutes))} min</span>
          </p>
          <p className="mt-1 text-xl font-semibold leading-tight !text-[var(--board-ink)]">
            <span className="sr-only">Próxima parada: </span>
            {nextStop?.address ?? "pendiente"}
          </p>
        </div>
      ) : null}
      {assignedRoute.status === "PLANNED" ? (
        <button
          className="rp-button rp-button-go rp-button-block"
          data-tip="tip.startRoute"
          onClick={() => void updateRouteStatus("IN_PROGRESS")}
          type="button"
        >
          {t("courier.start")}
        </button>
      ) : null}
      {canResolveCurrent && currentStop ? (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            className="rp-button rp-button-go rp-button-block"
            data-tip="tip.delivered"
            onClick={() => void updateDeliveryStatus(currentStop.id, "DELIVERED")}
            type="button"
          >
            {t("courier.deliverNow")}
          </button>
          <button
            className="rp-button rp-button-danger"
            data-tip="tip.failed"
            onClick={() => void updateDeliveryStatus(currentStop.id, "FAILED")}
            type="button"
          >
            {t("courier.failed")}
          </button>
        </div>
      ) : null}
    </div>
  ) : undefined;

  return (
    <AppShell active="courier">
      <main className="rp-courier">
        <SessionChangeNotice role="courier" />
        <section
          aria-label={t("courier.title")}
          className={`rp-stage ${stageWide ? "is-wide" : ""}`}
        >
          {assignedRoute ? (
            <CourierRouteMap
              className="absolute inset-0 h-full w-full"
              currentLocation={lastLocation}
              inset={inset}
              route={assignedRoute}
              trafficMarks={trafficMarks}
            />
          ) : null}
          <Sheet
            foot={sheetFoot}
            grabberLabel={t("courier.sheet.grabber")}
            head={
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold leading-tight">{t("courier.title")}</h1>
            <p className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${isTracking ? "feed-pulse bg-[var(--route)]" : "bg-[var(--line-strong)]"}`}
              />
              <span>
                <span className="sr-only">Sesión del repartidor: </span>
                {loadingProfile
                  ? "Verificando acceso…"
                  : formatCourierStatus(courierStatus, lastLocation !== null)}
              </span>
            </p>
                </div>
                {gpsButton}
              </div>
            }
            initialSnap={assignedRoute ? 2 : 1}
            label={t("courier.title")}
            mid={0.55}
            onLayout={handleSheetLayout}
            peek={assignedRoute ? 284 : 150}
          >
            <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              className="rp-button rp-button-quiet"
              disabled={loadingProfile}
              data-tip="tip.loadRoute"
              onClick={() => void loadAssignedRoute()}
              type="button"
            >
              {t("courier.loadRoute")}
            </button>
            <button
              className="rp-button rp-button-quiet"
              disabled={isTracking || loadingProfile}
              onClick={() => {
                void loadCourierProfile();
                void loadAssignedRoute();
              }}
              type="button"
              data-tip="tip.refreshStatus"
            >
              {t("courier.refresh")}
            </button>
          </div>
          {lastLocation ? (
            <p className="text-xs tabular-nums text-[var(--ink-soft)]">
              {t("courier.lastPosition")}: {lastLocation.lat.toFixed(6)}, {lastLocation.lng.toFixed(6)} ·{" "}
              {new Date(lastLocation.recordedAt).toLocaleString("es-CO")}
            </p>
          ) : null}
            </div>
        {error ? (
          <div className="rl-notice is-error mt-5" role="alert">
            {error}
          </div>
        ) : null}
            {assignedRoute ? (
              <section aria-label="Ruta asignada" className="mt-4">
                {navigation?.warning ? <p className="rl-notice is-warn" role="status">{navigation.warning}</p> : null}
            {navigationError ? (
              <p className="rl-notice is-warn mt-3" role="status">
                {navigationError}
              </p>
            ) : null}
            <div className="rl-head mt-8">
              <h2>
                <span>{t("courier.assigned")}</span>{" "}
                <small className="tabular-nums">
                  {assignedRoute.id.slice(0, 8)} · {t("courier.pendingCount", { n: activeDeliveryPoints.length })}
                </small>
              </h2>
              <span className={`rl-state ${assignedRoute.status === "IN_PROGRESS" ? "is-route" : ""}`}>
                {assignedRoute.status === "IN_PROGRESS" ? t("courier.inProgress") : t("courier.planned")}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--ink-soft)]">
                {assignedRoute.optimizedAt
                  ? `Última optimización: ${new Date(assignedRoute.optimizedAt).toLocaleString('es-CO')}`
                  : 'Ruta asignada por despacho; puedes recalcularla si cambia el tráfico.'}
                {assignedRoute.estimatedDurationMinutes !== undefined
                  ? ` · ${Math.ceil(assignedRoute.estimatedDurationMinutes)} min estimados` : ''}
              </p>
              {assignedRoute.status === "IN_PROGRESS" ? (
                <button
                  className="rp-button rp-button-quiet rp-button-small"
                  data-tip="tip.closeRoute"
                  onClick={() => void updateRouteStatus("COMPLETED")}
                  type="button"
                >
                  {t("courier.close")}
                </button>
              ) : null}
            </div>

            <section aria-label="Optimización de la ruta" className="rl-board mt-4 !p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold !text-[var(--board-ink)]">Optimización automática</h3>
                <label className="flex cursor-pointer items-center gap-2 text-xs !text-[var(--board-soft)]">
                  <input
                    checked={autoOptimize}
                    className="h-4 w-4"
                    onChange={(event) => setAutoOptimize(event.target.checked)}
                    type="checkbox"
                  />
                  {autoOptimize ? "Activada" : "Apagada"}
                </label>
              </div>
              <p className="mt-1 text-xs leading-5 !text-[var(--board-soft)]" aria-live="polite">
                {lastReviewAt
                  ? `Revisada a las ${new Date(lastReviewAt).toLocaleTimeString("es-CO")} con el tráfico de ahora, cada ${PROPOSAL_REFRESH_INTERVAL_MS / 1000} s.`
                  : "Revisando la ruta con el tráfico de ahora…"}
              </p>
              <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div>
                  <dt className="text-[11px] !text-[var(--board-soft)]">Mejoras aplicadas</dt>
                  <dd className="text-lg font-semibold tabular-nums !text-[var(--board-ink)]">{optimizations.length}</dd>
                </div>
                <div>
                  <dt className="text-[11px] !text-[var(--board-soft)]">Ahorro acumulado</dt>
                  <dd className="text-lg font-semibold tabular-nums !text-[var(--board-ink)]">
                    {Math.round(optimizations.reduce((sum, item) => sum + (item.savedMinutes ?? 0), 0))} min
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] !text-[var(--board-soft)]">Tiempo estimado</dt>
                  <dd className="text-lg font-semibold tabular-nums !text-[var(--board-ink)]">
                    {assignedRoute.estimatedDurationMinutes !== undefined ? `${Math.ceil(assignedRoute.estimatedDurationMinutes)} min` : "—"}
                  </dd>
                </div>
              </dl>
              {optimizations.length > 0 ? (
                <p className="mt-2 text-xs !text-[var(--board-soft)]">
                  Última: {new Date(optimizations[optimizations.length - 1]!.at).toLocaleTimeString("es-CO")} ·{" "}
                  {optimizations[optimizations.length - 1]!.auto ? "automática" : "manual"}
                  {optimizations[optimizations.length - 1]!.savedMinutes !== null
                    ? ` · ahorró ~${Math.round(optimizations[optimizations.length - 1]!.savedMinutes!)} min`
                    : ""}
                </p>
              ) : null}
            </section>
            {proposal && (proposal.worthApplying ?? proposal.changed) && proposal.orderedDeliveryPointIds.join(',') !== dismissedProposal && activeDeliveryPoints.length > 0 ? (
              <div className="rl-notice is-ok route-proposal mt-4" role="status">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t("courier.optimized")}</p>
                  <p className="text-sm leading-5">
                    {proposal.improvementMinutes !== null && proposal.improvementMinutes > 0
                      ? `Ahorras unos ${Math.round(proposal.improvementMinutes)} min con el tráfico de ahora${
                          proposal.baselineDurationMinutes != null
                            ? ` (de ${Math.round(proposal.baselineDurationMinutes)} a ${Math.round(proposal.estimatedDurationMinutes)} min).`
                            : "."
                        }`
                      : "La IA encontró un orden distinto según el tráfico de ahora."}
                  </p>
                  {proposal.aiOrder?.accepted ? (
                    <p className="text-xs leading-5">
                      La IA propuso este orden y el algoritmo lo verificó con Dijkstra: ahorra {proposal.aiOrder.savingMinutes ?? 0} min.
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button className="rp-button rp-button-quiet rp-button-small" disabled={applying}
                    onClick={() => setDismissedProposal(proposal.orderedDeliveryPointIds.join(","))} type="button">
                    {t("courier.dismissRoute")}
                  </button>
                  <button className="rp-button rp-button-go rp-button-small" data-tip="tip.applyRoute" disabled={applying}
                    onClick={() => void applyProposal()} type="button">
                    {applying ? t("courier.applying") : t("courier.applyRoute")}
                  </button>
                </div>
              </div>
            ) : null}
            {proposalStatus ? <p className="mt-3 text-xs text-[var(--ink-soft)]" aria-live="polite">{proposalStatus}</p> : null}
            {appliedNotice ? (
              <p className={`rl-notice is-ok mt-3 ${celebrating ? "route-celebrate" : ""}`} role="status">
                {appliedNotice}
              </p>
            ) : null}
            {pendingUpdates > 0 ? (
              <p className="rl-notice is-warn mt-3" role="status">
                {pendingUpdates} entrega{pendingUpdates === 1 ? "" : "s"} pendiente{pendingUpdates === 1 ? "" : "s"} de enviar; se reintentará sola.
              </p>
            ) : null}

            <ol aria-label="Paradas de tu ruta" className="rl-line is-route mt-5">
              {activeDeliveryPoints.length === 0 ? (
                <li className="rl-empty">{t("courier.noStops")}</li>
              ) : activeDeliveryPoints.map((point, index) => {
                const current = index === 0;
                return (
                  <li key={point.id} className={`rl-stop ${current ? "is-current" : "is-pending"}`}>
                    <span aria-hidden="true" className="rl-dot" />
                    <span className="rl-stop-label">
                      <span className="tabular-nums text-[var(--ink-soft)]">{(point.sequenceIndex ?? index) + 1}. </span>
                      {point.address}
                      <span className="rl-stop-meta">{formatDeliveryStatus(point.status)}</span>
                      {!current &&
