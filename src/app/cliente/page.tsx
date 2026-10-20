"use client";

import { apiFetch } from "@/lib/apiClient";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import CustomerOrderChat from "@/components/CustomerOrderChat";

const TrackingMap = dynamic(() => import("@/components/MapLibreRouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center bg-slate-100 text-sm text-slate-500">
      Cargando mapa de seguimiento…
    </div>
  ),
});

interface TrackingData {
  guide: string;
  status: "PENDING" | "EN_ROUTE" | "DELIVERED" | "FAILED";
  address: string;
  coordinates: { lat: number; lng: number };
  route: {
    id: string;
    status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
    courier: {
      currentLat: number | null;
      currentLng: number | null;
      lastLocationAt: string | null;
    };
    geometry: {
      type: "LineString";
      coordinates: Array<[number, number]>;
    } | null;
    geometryProvider: "OSRM" | "ORS" | null;
    estimatedMinutesFromNow: number | null;
    distanceFromCourierMeters: number | null;
    liveTraffic?: {
      source: "TOMTOM" | "ROAD_BASELINE";
      configured: boolean;
      applied: boolean;
      status: "LIVE" | "CACHE" | "STALE" | "NOT_CONFIGURED" | "UNAVAILABLE";
      scope: "FIRST_LEG_ONLY";
      warning: string | null;
    };
    estimateWarning?: string;
    navigationWarning?: string;
    estimateNote: string;
  } | null;
}

export default function ClientePage() {
  const [guide, setGuide] = useState("");
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackingRefreshWarning, setTrackingRefreshWarning] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const searchTracking = useCallback(async (requestedGuide = guide): Promise<void> => {
    const normalizedGuide = requestedGuide.trim();

    if (!normalizedGuide) {
      setError("Escribe el número de guía de tu pedido.");
      return;
    }

    const refreshingCurrentTracking = tracking?.guide === normalizedGuide;
    if (!refreshingCurrentTracking) {
      setTracking(null);
      setLastUpdatedAt(null);
    }
    setLoading(true);
    setError(null);
    setTrackingRefreshWarning(null);

    let failedResponseStatus: number | null = null;
    try {
      const response = await apiFetch(`/api/seguimiento?guia=${encodeURIComponent(normalizedGuide)}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        failedResponseStatus = response.status;
        throw new Error(await readApiError(response, "No se pudo consultar el pedido."));
      }

      const payload = (await response.json()) as { tracking: TrackingData };
      setTracking(payload.tracking);
      setLastUpdatedAt(new Date());
    } catch (searchError) {
      // La caída temporal admite mostrar datos previos; un rechazo de acceso debe borrarlos.
      const canKeepPreviousTracking =
        failedResponseStatus === null || failedResponseStatus === 429 || failedResponseStatus >= 500;
      if (refreshingCurrentTracking && canKeepPreviousTracking) {
        setTrackingRefreshWarning(
          "No pudimos actualizar ahora. Conservamos la última información consultada; puedes reintentar."
        );
      } else {
        setTracking(null);
        setLastUpdatedAt(null);
        setError(searchError instanceof Error ? searchError.message : "No se pudo consultar el pedido.");
      }
    } finally {
      setLoading(false);
    }
  }, [guide, tracking?.guide]);

  useEffect(() => {
    if (!tracking || tracking.status === "DELIVERED" || tracking.status === "FAILED") {
      return;
    }

    const interval = window.setInterval(() => {
      void searchTracking(tracking.guide);
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [searchTracking, tracking]);

  const courierPosition = tracking?.route &&
    tracking.route.courier.currentLat !== null &&
    tracking.route.courier.currentLng !== null
      ? {
        id: "courier",
        name: "En camino",
        currentLat: tracking.route.courier.currentLat,
        currentLng: tracking.route.courier.currentLng,
      }
    : null;
  const targetPoint = tracking
    ? {
        id: "customer-order",
        address: tracking.address,
        lat: tracking.coordinates.lat,
        lng: tracking.coordinates.lng,
        sequenceIndex: null,
        status: tracking.status,
      }
    : null;

  return (
    <AppShell active="tracking">
      <main className="rp-tracking px-5 py-8 text-slate-950 sm:px-8">
      <section className="mx-auto max-w-5xl">
        <Link className="text-sm font-semibold text-teal-700 hover:text-teal-900" href="/">
          ← Inicio
        </Link>
        <div className="mt-8 max-w-2xl">
          <h1 className="text-2xl font-semibold sm:text-[28px]">
            Sigue tu pedido con la guía
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Escribe tu guía privada para ver el estado de tu pedido.
          </p>
        </div>

        <form
          className="rp-panel mt-8 flex flex-col gap-3 bg-[var(--surface)] p-5 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void searchTracking();
          }}
        >
          <label className="flex-1 text-sm font-semibold text-slate-700" htmlFor="tracking-guide">
            Número de guía
            <input
              aria-describedby="tracking-guide-help"
              autoCapitalize="none"
              autoComplete="off"
              className="rp-input mt-2 px-3 py-3 font-mono text-sm"
              id="tracking-guide"
              onChange={(event) => setGuide(event.target.value)}
              placeholder="Pega aquí tu guía privada"
              spellCheck={false}
              value={guide}
            />
            <span className="mt-2 block text-xs font-normal leading-5 text-slate-600" id="tracking-guide-help">
              Es distinta al número de pedido. Si no la tienes, solicítala al comercio donde compraste.
            </span>
          </label>
          <button
            className="rp-button rp-button-primary px-5"
            disabled={loading}
            type="submit"
          >
            {loading ? "Buscando…" : "Buscar pedido"}
          </button>
        </form>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {tracking ? (
          <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            {trackingRefreshWarning ? (
              <p
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-950 lg:col-span-2"
                role="status"
              >
                {trackingRefreshWarning}
              </p>
            ) : null}
            <div className="rp-map-frame">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="break-all text-xs font-semibold text-slate-600">Guía {tracking.guide}</p>
                  <h2 className="mt-1 font-semibold text-slate-900">{tracking.address}</h2>
                </div>
                <span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700">
                  {formatStatus(tracking.status)}
                </span>
              </div>
              <TrackingMap
                ariaLabel="Mapa de seguimiento del pedido"
                className="h-[360px] w-full"
                couriers={courierPosition ? [courierPosition] : []}
                pendingPoints={targetPoint && !tracking.route ? [targetPoint] : []}
                routes={
                  tracking.route && courierPosition && targetPoint
                    ? [{
                        id: tracking.route.id,
                        courier: courierPosition,
                        deliveryPoints: [targetPoint],
                        geometryProvider: tracking.route.geometryProvider,
                        geometry: tracking.route.geometry,
                      }]
                    : []
                }
              />
            </div>

          <aside className="rp-panel p-5">
              {lastUpdatedAt ? (
                <p aria-live="polite" className="mt-1 text-xs leading-5 text-slate-500">
                  Última consulta {formatQueryTime(lastUpdatedAt)}
                  {tracking.status !== "DELIVERED" && tracking.status !== "FAILED"
                    ? " · se actualiza cada 30 s"
                    : ""}
                </p>
              ) : null}
              {tracking.route ? (
                <>
                  <h2 className="mt-3 text-xl font-semibold text-slate-900">
                    {tracking.route.estimatedMinutesFromNow === null
                      ? "Ruta asignada"
                      : `Aproximadamente ${Math.max(1, Math.round(tracking.route.estimatedMinutesFromNow))} min`}
                  </h2>
                  <dl className="mt-5 space-y-3 text-sm">
                    <InfoRow label="Entrega" value="En camino" />
                    <InfoRow
                      label="Distancia aproximada"
                      value={formatDistance(tracking.route.distanceFromCourierMeters)}
                    />
                    <InfoRow
                      label="Última señal GPS"
                      value={formatLastLocation(tracking.route.courier.lastLocationAt)}
                    />
                    <InfoRow label="Estado de ruta" value={formatRouteStatus(tracking.route.status)} />
                  </dl>
                  {tracking.route.liveTraffic ? (
                    <div
                      className={`mt-4 rounded-xl border px-3 py-3 ${
                        tracking.route.liveTraffic.applied
                          ? "border-emerald-200 bg-emerald-50"
                          : tracking.route.liveTraffic.configured
                            ? "border-amber-200 bg-amber-50"
                            : "border-slate-200 bg-slate-50"
                      }`}
                      role="status"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {tracking.route.liveTraffic.applied
                          ? "Tráfico TomTom aplicado parcialmente"
                          : tracking.route.liveTraffic.configured
                            ? "Sin ajuste de tráfico TomTom"
                            : "ETA con tiempos viales base"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-700">
                        {tracking.route.liveTraffic.warning ??
                          "La señal disponible cubre solo el primer tramo; los demás usan tiempos viales base."}
                      </p>
                    </div>
                  ) : null}
                  {tracking.route.navigationWarning ? (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                      {tracking.route.navigationWarning}
                    </p>
                  ) : null}
                  {tracking.route.estimateWarning ? (
                    <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                      {tracking.route.estimateWarning}
                    </p>
                  ) : null}
                  <p className="mt-5 text-xs leading-5 text-slate-600">{tracking.route.estimateNote}</p>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  El pedido fue recibido, pero todavía no ha sido asignado a una ruta.
                </p>
              )}
              <button
                className="rp-button rp-button-quiet mt-6 w-full"
                disabled={loading}
                onClick={() => void searchTracking(tracking.guide)}
                type="button"
              >
                {loading ? "Actualizando…" : "Actualizar ubicación"}
            </button>
          </aside>
          <CustomerOrderChat guide={tracking.guide} key={tracking.guide} />
        </section>
        ) : null}
      </section>
      </main>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-semibold text-slate-700">{value}</dd>
    </div>
  );
}

function formatStatus(status: TrackingData["status"]): string {
  return {
    PENDING: "Pendiente",
    EN_ROUTE: "En camino",
    DELIVERED: "Entregado",
    FAILED: "Incidencia",
  }[status];
}

function formatRouteStatus(status: NonNullable<TrackingData["route"]>["status"]): string {
  return {
    PLANNED: "Planificada",
    IN_PROGRESS: "En curso",
    COMPLETED: "Completada",
    CANCELLED: "Cancelada",
  }[status];
}

function formatDistance(distanceMeters: number | null): string {
  if (distanceMeters === null) {
    return "Pendiente";
  }

  return distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1)} km`
    : `${Math.round(distanceMeters)} m`;
}

function formatLastLocation(lastLocationAt: string | null): string {
  return lastLocationAt === null
    ? "Sin señal registrada"
    : new Date(lastLocationAt).toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      });
}

function formatQueryTime(updatedAt: Date): string {
  return updatedAt.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : fallback;
  } catch {
    return fallback;
  }
}
