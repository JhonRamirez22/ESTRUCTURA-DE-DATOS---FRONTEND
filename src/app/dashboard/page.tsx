'use client';

import { apiFetch, apiJson, ApiRequestError } from '@/lib/apiClient';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { usePreferences, useT } from '@/lib/preferences';
import { isCourierLocationFresh } from '@/lib/courierLocation';
import { isRoadGeometryProvider } from '@/lib/roadGeometry';
import { formatNotificationMessage, formatOrderReference } from '@/lib/formatOrderReference';
import { SessionChangeNotice } from "@/components/SessionChangeNotice";
import OptimizationFeed from '@/components/OptimizationFeed';
import { RouteLine, RouteStrip, type StopState } from '@/components/RouteLine';
import OptimizationLadder from '@/components/OptimizationLadder';
import AiGroupSuggestions from '@/components/AiGroupSuggestions';
import DispatchSuggestions from '@/components/DispatchSuggestions';
import { DispatchAction, DispatchSteps } from '@/components/DispatchGuide';
import DemoGpsButton from '@/components/DemoGpsButton';
import RouteImprovementCheck from '@/components/RouteImprovementCheck';
import { LiveOptimizationHud, LiveRouteSuggestion } from '@/components/LiveOptimizationHud';
import { appliableRoutes, type LiveRouteProposal } from '@/lib/liveOptimization';
import { RouteColorAssigner } from '@/lib/routeColors';
import { useLiveOptimization } from '@/lib/useLiveOptimization';
import { orderBadges } from '@/lib/orderBadges';
import { defaultCourierSelection, dispatchFlow } from '@/lib/dispatchFlow';
import Sheet, { type SheetLayout } from '@/components/Sheet';
import SegmentedTabs from '@/components/SegmentedTabs';
import { useUndoToast } from '@/components/UndoToast';
import type { MapInset } from '@/components/MapLibreRouteMap';
import { formatBogota, splitSchedule, type ScheduleState } from '@/lib/history';
import type { RouteOptimization } from '@/lib/routeOptimization';
import { improvementTone, topMoves, type AssignmentImprovement } from '@/lib/assignmentImprovement';

const RouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[#17242b] text-sm text-slate-300">
      Cargando mapa de Pasto…
    </div>
  ),
});

type CourierStatus = 'AVAILABLE' | 'ON_ROUTE' | 'OFFLINE';

interface Courier {
  id: string;
  name: string;
  phone: string;
  status: CourierStatus;
  currentLat: number | null;
  currentLng: number | null;
  lastLocationAt: string | null;
}

interface DeliveryPoint {
  id: string;
  orderId: string;
  address: string;
  lat: number;
  lng: number;
  status: 'PENDING' | 'EN_ROUTE' | 'DELIVERED' | 'FAILED';
  sequenceIndex: number | null;
  priority?: number;
  timeWindow?: { start?: string; end?: string } | null;
  routeId?: string | null;
  scheduledFor?: string | null;
  scheduleState?: ScheduleState | null;
}

interface Route {
  id: string;
  courierId: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  estimatedDurationMinutes: number;
  estimatedDistanceMeters: number;
  canUndo: boolean;
  geometry: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  } | null;
  geometryProvider: 'OSRM' | 'ORS' | null;
  courier: Courier;
  deliveryPoints: DeliveryPoint[];
  optimization?: RouteOptimization | null;
}

interface DashboardData {
  couriers: Courier[];
  notifications: Notification[];
  notificationsWarning: string | null;
  pendingPoints: DeliveryPoint[];
  scheduledPoints: DeliveryPoint[];
  routes: Route[];
  metrics: FleetMetrics;
}

interface FleetMetrics {
  routeCount: number;
  completedRouteCount: number;
  estimatedDurationMinutes: number;
  estimatedDistanceMeters: number;
  timeSavedMinutes: number;
  distanceSavedMeters: number;
  routesWithBaseline: number;
}

interface AssignmentAiStatus {
  source: 'external-ai' | 'deterministic' | 'tomtom-live';
  applied: boolean;
  model?: string;
