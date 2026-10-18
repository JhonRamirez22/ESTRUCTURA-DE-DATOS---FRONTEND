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
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Sigue tu pedido con la guía
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Consulta el estado, la ubicación aproximada del repartidor y un
            tiempo estimado actualizado mientras la ruta está activa.
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
            className="rp-button rp-button-primary px-5 disabled:opacity-60"
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

        {!tracking ? (
          <section
            aria-labelledby="tracking-first-value-title"
            className="mt-8 border-y border-slate-200 py-6 sm:py-7"
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] sm:gap-8">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950" id="tracking-first-value-title">
                  Qué verás al consultar
                </h2>
                <p className="mt-2 max-w-[42ch] text-sm leading-6 text-slate-600">
                  La guía privada abre el seguimiento de un solo pedido; no necesitas una cuenta.
                </p>
