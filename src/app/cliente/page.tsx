"use client";

import { apiFetch } from "@/lib/apiClient";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { usePreferences, useT } from '@/lib/preferences';
import CustomerOrderChat from "@/components/CustomerOrderChat";
import { RouteLine, type LineStop } from "@/components/RouteLine";
import Sheet, { type SheetLayout } from "@/components/Sheet";
import type { MapInset } from "@/components/MapLibreRouteMap";
import { formatBogota } from "@/lib/history";
import type { MessageKey } from "@/lib/i18n";

const TrackingMap = dynamic(() => import("@/components/MapLibreRouteMap"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#17242b] text-sm text-slate-300">
      Cargando mapa de seguimiento…
    </div>
  ),
});

interface TrackingData {
  guide: string;
  status: "REQUESTED" | "PENDING" | "EN_ROUTE" | "DELIVERED" | "FAILED";
  address: string;
  coordinates: { lat: number; lng: number };
  milestones?: Array<{ type: string; at: string }>;
  scheduledFor?: string | null;
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
  const { t, lang } = usePreferences();
  const [guide, setGuide] = useState("");
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
