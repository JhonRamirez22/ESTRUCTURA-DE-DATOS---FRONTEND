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
