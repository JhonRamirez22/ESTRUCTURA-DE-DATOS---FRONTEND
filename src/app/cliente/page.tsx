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
