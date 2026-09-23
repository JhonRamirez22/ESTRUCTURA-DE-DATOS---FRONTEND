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
