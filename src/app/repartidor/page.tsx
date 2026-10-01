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
