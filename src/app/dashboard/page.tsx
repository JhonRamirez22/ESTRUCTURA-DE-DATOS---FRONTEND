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
  warning?: string;
}

interface LiveTrafficStatus {
  source: string;
  configured: boolean;
  applied: boolean;
  routeSegments: number;
  sampledSegments: number;
  adjustedSegments: number;
  closedSegments: number;
  coverageRatio: number;
  warning: string;
}

const ROUTE_STATUS_PRIORITY: Record<Route['status'], number> = {
  IN_PROGRESS: 0,
  PLANNED: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

interface Notification {
  id: string;
  kind:
    | 'DELIVERY_STATUS_CHANGED'
    | 'ROUTE_CREATED'
    | 'ROUTE_RECALCULATED'
    | 'ROUTE_RECALCULATION_FAILED';
  title: string;
  message: string;
  createdAt: string;
}

interface AssignmentProposal {
  courierId: string;
  deliveryPointIds: string[];
}

const EMPTY_DASHBOARD_DATA: DashboardData = {
    couriers: [],
    notifications: [],
    notificationsWarning: null,
    pendingPoints: [],
    scheduledPoints: [],
    routes: [],
    metrics: {
      routeCount: 0,
      completedRouteCount: 0,
      estimatedDurationMinutes: 0,
      estimatedDistanceMeters: 0,
      timeSavedMinutes: 0,
      distanceSavedMeters: 0,
      routesWithBaseline: 0,
    },
};

/** Pedidos visibles antes de «Ver todos»: deja los repartidores a la vista sin scroll anidado. */
const COLLAPSED_ORDERS = 5;

export default function DashboardPage() {
  const { t, lang } = usePreferences();
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [recalculatingRouteId, setRecalculatingRouteId] = useState<string | null>(null);
  const [undoingRouteId, setUndoingRouteId] = useState<string | null>(null);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [selectedCourierIds, setSelectedCourierIds] = useState<string[]>([]);
  const knownCourierIds = useRef<Set<string>>(new Set());
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentProposal[]>([]);
  const [assignmentPreviewSelectionKey, setAssignmentPreviewSelectionKey] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);
  const [unassignedDeliveryPointIds, setUnassignedDeliveryPointIds] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dashboardWarning, setDashboardWarning] = useState<string | null>(null);
  const [operationalReady, setOperationalReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [routeActionNotice, setRouteActionNotice] = useState<string | null>(null);
  const [assignmentAiStatus, setAssignmentAiStatus] = useState<AssignmentAiStatus | null>(null);
  const [assignmentImprovement, setAssignmentImprovement] = useState<AssignmentImprovement | null>(null);
  const [liveTrafficNotice, setLiveTrafficNotice] = useState<string | null>(null);
  const undoToast = useUndoToast(t('undo.action'));
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [sheetTab, setSheetTab] = useState<'pedidos' | 'rutas' | 'actividad'>('pedidos');
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
  const dashboardRequestId = useRef(0);
  const dashboardController = useRef<AbortController | null>(null);
  const selectionInitialized = useRef(false);
  const assignmentSelectionKey = JSON.stringify([
    [...selectedCourierIds].sort(),
    [...selectedPendingIds].sort(),
  ]);
  const assignmentPreviewIsCurrent = assignmentPreviewSelectionKey === assignmentSelectionKey;

  const loadDashboard = useCallback(async (background = false) => {
    if (background && (dashboardController.current || document.visibilityState === 'hidden')) return;
    dashboardController.current?.abort();
