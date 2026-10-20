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

const CourierRouteMap = dynamic(() => import("./CourierRouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[340px] items-center justify-center bg-slate-100 text-sm text-slate-500">
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
  estimatedDurationMinutes: number;
  improvementMinutes: number | null;
  computedAt: string;
  cached: boolean;
  warning?: string | null;
}

interface TrafficObservation extends MapTrafficMark {
  observedAt: string;
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
  const [stopEtas, setStopEtas] = useState<StopEta[]>([]);
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

  const applyProposal = async (): Promise<void> => {
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
      setAppliedNotice("Ruta optimizada aplicada: el orden de tus paradas ya está actualizado.");
      setCelebrating(true);
      void refreshNavigation(result.route.id).catch(() => undefined);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "No se pudo aplicar la ruta optimizada.");
    } finally {
      routeGeneration.current += 1;
      setApplying(false);
    }
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
        const payload = (await response.json()) as { etas?: StopEta[] };
        if (!disposed) setStopEtas(payload.etas ?? []);
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

  return (
    <AppShell active="courier">
      <main className="rp-courier rl-page !max-w-xl">
        <SessionChangeNotice role="courier" />
        <header className="rl-page-head !mb-5">
          <div>
            <h1>{t("courier.title")}</h1>
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
        </header>

        <div className="grid gap-3">
          {/* Una sola acción de ubicación visible: iniciar o detener según el estado. */}
          {isTracking ? (
            <button className="rp-button rp-button-danger rp-button-block" data-tip="tip.stopGps" onClick={stopTracking} type="button">
              {t("courier.stopGps")}
            </button>
          ) : (
            <button
              className="rp-button rp-button-go rp-button-block"
              data-tip="tip.startGps"
              disabled={loadingProfile}
              onClick={startTracking}
              type="button"
            >
              {t("courier.startGps")}
            </button>
          )}
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
          <section aria-label="Ruta asignada" className="mt-8">
            {navigation ? (
              <div className="rl-board">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-semibold !text-[var(--board-soft)]">{t("courier.nav")}</p>
                  <span className="rl-state text-[var(--board-soft)]">Calles {navigation.geometryProvider}</span>
                </div>
                <p className="mt-2 text-2xl font-semibold leading-tight !text-[var(--board-ink)]">
                  <span className="sr-only">Próxima parada: </span>
                  {nextStop?.address ?? "pendiente"}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-4">
                  <div className="flex flex-col-reverse">
                    <dt className="text-xs text-[var(--board-soft)]">{t("courier.distance")}</dt>
                    <dd className="text-2xl font-semibold tabular-nums">{formatDistance(navigation.distanceMeters)}</dd>
                  </div>
                  <div className="flex flex-col-reverse">
                    <dt className="text-xs text-[var(--board-soft)]">{t("courier.eta")}</dt>
                    <dd className="text-2xl font-semibold tabular-nums">
                      {Math.max(1, Math.round(navigation.durationMinutes))} min
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-5">
                  {navigation.warning ??
                    `El trazado sigue calles de OpenStreetMap mediante ${navigation.geometryProvider}. El proveedor público no ofrece tráfico en tiempo real.`}
                </p>
              </div>
            ) : null}
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
              {assignedRoute.status === "PLANNED" ? (
                <button
                  className="rp-button rp-button-primary rp-button-small"
                  data-tip="tip.startRoute"
                  onClick={() => void updateRouteStatus("IN_PROGRESS")}
                  type="button"
                >
                  {t("courier.start")}
                </button>
              ) : null}
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

            {proposal?.changed && activeDeliveryPoints.length > 0 ? (
              <div className="rl-notice is-ok route-proposal mt-4" role="status">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t("courier.optimized")}</p>
                  <p className="text-sm leading-5">
                    {proposal.improvementMinutes !== null && proposal.improvementMinutes > 0
                      ? `Ahorras unos ${Math.round(proposal.improvementMinutes)} min con el tráfico de ahora.`
                      : "La IA encontró un orden distinto según el tráfico de ahora."}
                  </p>
                  {proposal.aiOrder?.accepted ? (
                    <p className="text-xs leading-5">
                      La IA propuso este orden y el algoritmo lo verificó con Dijkstra: ahorra {proposal.aiOrder.savingMinutes ?? 0} min.
                    </p>
                  ) : null}
                </div>
                <button className="rp-button rp-button-go rp-button-small" data-tip="tip.applyRoute" disabled={applying}
                  onClick={() => void applyProposal()} type="button">
                  {applying ? t("courier.applying") : t("courier.applyRoute")}
                </button>
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
                      {assignedRoute.status === "IN_PROGRESS" &&
                      (point.status === "PENDING" || point.status === "EN_ROUTE") ? (
                        <span className="mt-2 flex gap-2">
                          <button
                            className={`rp-button ${current ? "rp-button-go" : "rp-button-quiet"} rp-button-small`}
                            data-tip="tip.delivered"
                            onClick={() => void updateDeliveryStatus(point.id, "DELIVERED")}
                            type="button"
                          >
                            {t("courier.delivered")}
                          </button>
                          <button
                            className="rp-button rp-button-danger rp-button-small"
                            data-tip="tip.failed"
                            onClick={() => void updateDeliveryStatus(point.id, "FAILED")}
                            type="button"
                          >
                            {t("courier.failed")}
                          </button>
                        </span>
                      ) : null}
                    </span>
                    <span />
                  </li>
                );
              })}
            </ol>

            <div className={`mt-6 overflow-hidden rounded ${celebrating ? "route-celebrate" : ""}`}>
              <CourierRouteMap currentLocation={lastLocation} route={assignedRoute} trafficMarks={trafficMarks} />
            </div>
            {trafficMarks.length > 0 ? (
              <p className="mt-2 text-xs text-[var(--ink-soft)]">
                Tráfico sobre tu ruta: {summarizeTraffic(trafficMarks)}. Medido a las{" "}
                {new Date(trafficMarks[0]!.observedAt).toLocaleTimeString("es-CO")}.
              </p>
            ) : null}
            {nearest.length > 0 ? (
              <section aria-label="Próximas paradas por tiempo estimado" className="mt-6">
                <div className="rl-head">
                  <h3>{t("courier.nearest")}</h3>
                </div>
                <ul className="rl-rows">
                  {nearest.map((eta) => (
                    <li key={eta.stopId} className="rl-row !min-h-11 text-sm">
                      <span className="rl-row-main">
                        {assignedRoute.deliveryPoints.find((point) => point.id === eta.stopId)?.address ?? "Parada"}
                      </span>
                      <span className="tabular-nums font-semibold">{Math.ceil(eta.estimatedMinutesFromNow)} min</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </section>
        ) : null}

        {!assignedRoute && !loadingProfile && !error ? (
          <p className="rl-empty mt-6">
            {loadingProfile ? "Cargando tus entregas…" : t("courier.noRoute")}
          </p>
        ) : null}
      </main>
    </AppShell>
  );
}

async function sendLocation(
  location: LastLocation,
): Promise<{ accepted: boolean; error?: string }> {
  try {
    const response = await apiFetch("/api/repartidores/me/ubicacion", {
      body: JSON.stringify(location),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      return {
        accepted: false,
        error: await readApiError(response, "El servidor rechazó la ubicación."),
      };
    }

    const payload = (await response.json()) as { accepted: boolean };
    return payload.accepted
      ? { accepted: true }
      : { accepted: false, error: "Se ignoró una posición más antigua que la última recibida." };
  } catch (error) {
    // La siguiente lectura de geolocalización volverá a intentar sincronizar la posición.
    return {
      accepted: false,
      error: error instanceof Error ? error.message : "No se pudo enviar la ubicación.",
    };
  }
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

function formatDeliveryStatus(status: AssignedRoute["deliveryPoints"][number]["status"]): string {
  switch (status) {
    case "DELIVERED":
      return "Entregada";
    case "FAILED":
      return "Fallida";
    case "EN_ROUTE":
      return "En camino";
    default:
      return "Pendiente";
  }
}

function formatDistance(distanceMeters: number): string {
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }

  return `${Math.round(distanceMeters)} m`;
}

function formatCourierStatus(
  status: CourierProfile["status"],
  hasFreshPosition: boolean,
): string {
  if (status !== "OFFLINE" && !hasFreshPosition) {
    return "GPS vencido · no disponible para asignación";
  }

  switch (status) {
    case "AVAILABLE":
      return "Disponible · GPS reciente";
    case "ON_ROUTE":
      return "En ruta";
    default:
      return "Fuera de turno";
  }
}

function formatGeolocationError(error: GeolocationPositionError): string {
  if (error.code === GeolocationPositionError.PERMISSION_DENIED) {
    return "Permite el acceso a la ubicación para iniciar el seguimiento.";
  }

  if (error.code === GeolocationPositionError.TIMEOUT) {
    return "El dispositivo tardó demasiado en obtener la ubicación.";
  }

  return "No se pudo obtener la ubicación actual. Intenta moverte a un lugar con mejor señal.";
}

