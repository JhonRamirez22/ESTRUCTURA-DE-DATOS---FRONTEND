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
