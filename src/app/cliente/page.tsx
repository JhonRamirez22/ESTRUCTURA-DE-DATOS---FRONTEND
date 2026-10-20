"use client";

import { apiFetch } from "@/lib/apiClient";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { usePreferences, useT } from '@/lib/preferences';
import CustomerOrderChat from "@/components/CustomerOrderChat";
import { RouteLine, type LineStop } from "@/components/RouteLine";

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
  status: "REQUESTED" | "PENDING" | "EN_ROUTE" | "DELIVERED" | "FAILED";
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
  const { t } = usePreferences();
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

  // El enlace de una solicitud recién enviada trae la guía: se consulta una sola vez.
  const guideFromLink = useRef(false);
  useEffect(() => {
    if (guideFromLink.current) return;
    guideFromLink.current = true;
    const linked = new URLSearchParams(window.location.search).get("guia")?.trim();
    if (linked) {
      setGuide(linked);
      void searchTracking(linked);
    }
  }, [searchTracking]);

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
        // El mapa dibuja una solicitud en revisión igual que un pedido pendiente.
        status: tracking.status === "REQUESTED" ? ("PENDING" as const) : tracking.status,
      }
    : null;

  return (
    <AppShell active="tracking">
      <main className="rp-tracking rl-page !max-w-5xl">
        <Link className="ui-back-link !text-[var(--ink-soft)] hover:!text-[var(--foreground)]" href="/">
          ← Inicio
        </Link>
        <header className="rl-page-head mt-2">
          <div>
            <h1>{t("tracking.title")}</h1>
            <p>{t("tracking.lead")}</p>
          </div>
        </header>

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            void searchTracking();
          }}
        >
          <label className="rp-field-label flex-1" htmlFor="tracking-guide">
            {t("tracking.guide")}
            <input
              aria-describedby="tracking-guide-help"
              autoCapitalize="none"
              autoComplete="off"
              className="rp-input mt-1.5 px-3 text-[15px] font-normal tabular-nums"
              id="tracking-guide"
              onChange={(event) => setGuide(event.target.value)}
              placeholder="Pega aquí tu guía privada"
              spellCheck={false}
              value={guide}
            />
            <span className="rp-field-help" id="tracking-guide-help">
              Es distinta al número de pedido. Si no la tienes, solicítala al comercio donde compraste.
            </span>
          </label>
          <button className="rp-button rp-button-primary min-h-12 px-6 sm:mt-[25px]" data-tip="tip.searchGuide" disabled={loading} type="submit">
            {loading ? t("tracking.searching") : t("tracking.search")}
          </button>
        </form>

        {error ? (
          <div className="rl-notice is-error mt-5" role="alert">
            {error}
          </div>
        ) : null}

        {tracking ? (
          <section className="mt-8 grid items-start gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
            {trackingRefreshWarning ? (
              <p className="rl-notice is-warn lg:col-span-2" role="status">
                {trackingRefreshWarning}
              </p>
            ) : null}

            <aside className="min-w-0">
              <div className="rl-board">
                <p className="break-all text-xs font-semibold">Guía {tracking.guide}</p>
                <p className="mt-3 text-3xl font-semibold leading-tight !text-[var(--board-ink)]">
                  {tracking.route
                    ? tracking.route.estimatedMinutesFromNow === null
                      ? t("tracking.assigned")
                      : t("tracking.approx", { min: Math.max(1, Math.round(tracking.route.estimatedMinutesFromNow)) })
                    : formatStatus(tracking.status)}
                </p>
                <h2 className="mt-2 text-sm font-normal !text-[var(--board-soft)]">{tracking.address}</h2>
                <div className="mt-5">
                  <RouteLine label={t("tracking.progress")} selected stops={trackingStages(tracking, t)} />
                </div>
                {lastUpdatedAt ? (
                  <p aria-live="polite" className="mt-2 text-xs leading-5">
                    Última consulta {formatQueryTime(lastUpdatedAt)}
                    {tracking.status !== "DELIVERED" && tracking.status !== "FAILED"
                      ? " · se actualiza cada 30 s"
                      : ""}
                  </p>
                ) : null}
              </div>

              {tracking.route ? (
                <>
                  <dl className="mt-5 text-sm">
                    <InfoRow label={t("tracking.delivery")} value={t("tracking.onWay")} />
                    <InfoRow label={t("tracking.distance")} value={formatDistance(tracking.route.distanceFromCourierMeters)} />
                    <InfoRow label={t("tracking.lastGps")} value={formatLastLocation(tracking.route.courier.lastLocationAt)} />
                    <InfoRow label={t("tracking.routeStatus")} value={formatRouteStatus(tracking.route.status)} />
                  </dl>
                  {tracking.route.liveTraffic ? (
                    <div
                      className={`rl-notice mt-4 !block ${
                        tracking.route.liveTraffic.applied ? "is-ok" : tracking.route.liveTraffic.configured ? "is-warn" : ""
                      }`}
                      role="status"
                    >
                      <p className="font-semibold">
                        {tracking.route.liveTraffic.applied
                          ? "Tráfico TomTom aplicado parcialmente"
                          : tracking.route.liveTraffic.configured
                            ? "Sin ajuste de tráfico TomTom"
                            : "ETA con tiempos viales base"}
                      </p>
                      <p className="mt-1 text-xs leading-5">
                        {tracking.route.liveTraffic.warning ??
                          "La señal disponible cubre solo el primer tramo; los demás usan tiempos viales base."}
                      </p>
                    </div>
                  ) : null}
                  {tracking.route.navigationWarning ? (
                    <p className="rl-notice is-warn mt-3 text-xs leading-5">{tracking.route.navigationWarning}</p>
                  ) : null}
                  {tracking.route.estimateWarning ? (
                    <p className="rl-notice is-warn mt-3 text-xs leading-5">{tracking.route.estimateWarning}</p>
                  ) : null}
                  <p className="mt-4 text-xs leading-5 text-[var(--ink-soft)]">{tracking.route.estimateNote}</p>
                </>
              ) : (
                <p className="mt-4 text-sm leading-6 text-[var(--ink-soft)]">
                  {tracking.status === "REQUESTED"
                    ? "Recibimos tu solicitud. El despacho la revisa antes de asignarla a un repartidor."
                    : "El pedido fue recibido, pero todavía no ha sido asignado a una ruta."}
                </p>
              )}
              <button
                className="rp-button rp-button-quiet mt-5 w-full"
                data-tip="tip.refreshTracking"
                disabled={loading}
                onClick={() => void searchTracking(tracking.guide)}
                type="button"
              >
                {loading ? t("tracking.refreshing") : t("tracking.refresh")}
              </button>
            </aside>

            <div className="min-w-0 space-y-8">
              <div className="rp-map-frame">
                <div className="rp-map-heading">
                  <h2>{t("tracking.map")}</h2>
                  <span className="rl-state text-[var(--board-soft)]">{formatStatus(tracking.status)}</span>
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
              <CustomerOrderChat guide={tracking.guide} key={tracking.guide} />
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}

/** Cuatro paradas del pedido: dónde va, sin datos de otros envíos. */
function trackingStages(tracking: TrackingData, t: ReturnType<typeof useT>): LineStop[] {
  const delivered = tracking.status === "DELIVERED";
  const failed = tracking.status === "FAILED";
  const enRoute = tracking.status === "EN_ROUTE";
  const assigned = tracking.route !== null;
  const inReview = tracking.status === "REQUESTED";
  return [
    {
      id: "recibido",
      label: inReview ? t("tracking.stage.review") : t("tracking.stage.received"),
      meta: inReview ? t("tracking.stage.review.meta") : undefined,
      state: inReview ? "current" : "done",
    },
    {
      id: "asignado",
      label: t("tracking.stage.assigned"),
      state: inReview ? "pending" : assigned || delivered || failed ? "done" : "current",
    },
    { id: "camino", label: t("tracking.stage.onWay"), state: enRoute ? "current" : delivered || failed ? "done" : "pending" },
    {
      id: "entregado",
      label: failed ? t("tracking.stage.failed") : t("tracking.stage.delivered"),
      state: delivered || failed ? "current" : "pending",
    },
  ];
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] py-2.5">
      <dt className="text-[var(--ink-soft)]">{label}</dt>
      <dd className="text-right font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function formatStatus(status: TrackingData["status"]): string {
  return {
    REQUESTED: "En revisión",
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
