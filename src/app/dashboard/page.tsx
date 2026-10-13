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
    const controller = new AbortController();
    dashboardController.current = controller;
    const requestId = ++dashboardRequestId.current;
    setLoading(true);
    setError(null);

    try {
      const options = { signal: controller.signal };
      const results = await Promise.allSettled([
        apiJson<{ couriers: Courier[] }>('/api/repartidores', options),
        apiJson<{ deliveryPoints: DeliveryPoint[] }>('/api/pedidos?status=PENDING', options),
        apiJson<{ routes: Route[] }>('/api/rutas', options),
        apiJson<{ notifications: Notification[]; warning?: string }>('/api/notificaciones?recipientId=dispatcher&limit=5', options),
        apiJson<{ metrics: FleetMetrics }>('/api/analitica', options),
      ]);
      if (controller.signal.aborted || requestId !== dashboardRequestId.current) return;
      const names = ['Repartidores', 'Pedidos', 'Rutas', 'Avisos', 'Analítica'];
      const describeFailure = (index: number) => {
        const result = results[index];
        if (result.status !== 'rejected') return '';
        const cause: unknown = result.reason;
        return `${names[index]}: ${cause instanceof Error ? cause.message : 'No disponible.'}${cause instanceof ApiRequestError ? ` Referencia: ${cause.requestId}.` : ''}`;
      };
      const denied = results.findIndex((result) => result.status === 'rejected' &&
        result.reason instanceof ApiRequestError && [401, 403].includes(result.reason.status ?? 0));
      if (denied !== -1) {
        setOperationalReady(false);
        setSessionExpired(results[denied].status === 'rejected' && results[denied].reason.status === 401);
        setData(EMPTY_DASHBOARD_DATA);
        setLastUpdatedAt(null);
        setDashboardWarning(null);
        setSelectedCourierIds([]);
        setSelectedPendingIds([]);
        setAssignmentPreview([]);
        setAssignmentPreviewSelectionKey(null);
        setUnassignedDeliveryPointIds([]);
        setRouteActionNotice(null);
        setAssignmentAiStatus(null);
        setLiveTrafficNotice(null);
        throw new Error(describeFailure(denied));
      }
      const [couriers, orders, routes, notifications, analytics] = results;
      setDashboardWarning(results.slice(3).map((result, index) => result.status === 'rejected'
        ? describeFailure(index + 3) : '').filter(Boolean).join(' ') || null);
      if (couriers.status !== 'fulfilled' || orders.status !== 'fulfilled' || routes.status !== 'fulfilled') {
        setOperationalReady(false);
        throw new Error(results.slice(0, 3).map((result, index) => result.status === 'rejected'
          ? describeFailure(index) : '').filter(Boolean).join(' '));
      }
      const couriersPayload = couriers.value;
      const ordersPayload = orders.value;
      const routesPayload = routes.value;
      if (!Array.isArray(couriersPayload?.couriers) || !Array.isArray(ordersPayload?.deliveryPoints) ||
          !Array.isArray(routesPayload?.routes)) {
        setOperationalReady(false);
        throw new Error('Los datos operativos tienen un formato inválido. Reintenta la actualización.');
      }
      const availableCourierIds = couriersPayload.couriers
        .filter(
          (courier) =>
            courier.status === 'AVAILABLE' &&
            courier.currentLat !== null &&
            courier.currentLng !== null &&
            isCourierLocationFresh(
              courier.lastLocationAt ? new Date(courier.lastLocationAt) : null
            )
        )
        .map((courier) => courier.id);

      // Todos los repartidores disponibles quedan marcados para repartir la carga; quien el
      // despachador desmarca se respeta y solo se suman los que se acaban de conectar.
      // El «updater» debe ser puro (React lo puede ejecutar dos veces): se lee una copia de los
      // conocidos y la referencia se actualiza fuera de él.
      const knownBefore = knownCourierIds.current;
      knownCourierIds.current = new Set(availableCourierIds);
      setSelectedCourierIds(
        (current) => defaultCourierSelection(availableCourierIds, knownBefore, current).selection
      );
      // Un pedido PENDING con ruta ya está asignado: no está disponible para despachar otra vez.
      // Los programados lejanos esperan en su cola; vencidos y próximos entran primero a la de despacho.
      const { ready: unassigned, waiting: scheduled } = splitSchedule(
        ordersPayload.deliveryPoints.filter((point) => !point.routeId)
      );
      if (!selectionInitialized.current) {
        setSelectedPendingIds(unassigned.map((point) => point.id));
        selectionInitialized.current = true;
      } else {
        setSelectedPendingIds((current) =>
          current.filter((id) => unassigned.some((point) => point.id === id))
        );
      }

      setData((previous) => ({
        couriers: couriersPayload.couriers,
        notifications: notifications.status === 'fulfilled' && Array.isArray(notifications.value?.notifications)
          ? notifications.value.notifications : previous.notifications,
        notificationsWarning: notifications.status === 'fulfilled' ? notifications.value?.warning ?? null : 'Avisos anteriores; no se pudieron actualizar.',
        pendingPoints: unassigned,
        scheduledPoints: scheduled,
        routes: routesPayload.routes,
        metrics: analytics.status === 'fulfilled' && analytics.value?.metrics
          ? analytics.value.metrics : previous.metrics,
      }));
      setOperationalReady(true);
      setSessionExpired(false);
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      if (controller.signal.aborted || requestId !== dashboardRequestId.current) return;
      setOperationalReady(false);
      setError(loadError instanceof TypeError || loadError instanceof SyntaxError
        ? 'La respuesta operativa tiene un formato inválido. Actualiza antes de continuar.'
        : loadError instanceof Error ? loadError.message : 'No se pudo actualizar la operación.');
    } finally {
      if (requestId === dashboardRequestId.current) {
        dashboardController.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    return () => dashboardController.current?.abort();
  }, [loadDashboard]);

  useEffect(() => {
    const refreshInterval = window.setInterval(() => {
      void loadDashboard(true);
    }, 10_000);

    return () => window.clearInterval(refreshInterval);
  }, [loadDashboard]);

  const routesByOperationalPriority = [...data.routes].sort(
    (left, right) => ROUTE_STATUS_PRIORITY[left.status] - ROUTE_STATUS_PRIORITY[right.status]
  );
  const activeRoutes = routesByOperationalPriority.filter(
    (route) => route.status === 'PLANNED' || route.status === 'IN_PROGRESS'
  );
  // Cada ruta conserva su color mientras exista; el mapa y las tarjetas comparten la paleta.
  const colorAssigner = useRef(new RouteColorAssigner());
  const activeRouteIds = activeRoutes.map((route) => route.id).join(',');
  const routeColors = useMemo(
    () => colorAssigner.current.assign(activeRouteIds ? activeRouteIds.split(',') : []),
    [activeRouteIds],
  );
  // Recalcula toda la flota cada 10 s y propone mejoras; nada se aplica solo.
  const live = useLiveOptimization(activeRoutes.length > 0 && operationalReady, 10_000);
  const [applyingLive, setApplyingLive] = useState(false);
  const applyLiveRoute = async (routeId: string): Promise<void> => {
    await recalculateRouteGeometry(routeId);
    live.refresh();
  };
  const applyAllLive = async (): Promise<void> => {
    setApplyingLive(true);
    try {
      for (const item of appliableRoutes(live.proposal)) await recalculateRouteGeometry(item.routeId);
    } finally {
      setApplyingLive(false);
      live.refresh();
    }
  };
  const liveByRoute = new Map((live.proposal?.routes ?? []).map((item) => [item.routeId, item]));
  const historicalRoutes = routesByOperationalPriority.filter(
    (route) => route.status === 'COMPLETED' || route.status === 'CANCELLED'
  );
  const pendingStops = activeRoutes.reduce(
    (total, route) =>
      total +
      route.deliveryPoints.filter(
        (point) => point.status === 'PENDING' || point.status === 'EN_ROUTE'
      ).length,
    0
  );

  const updateRouteStatus = async (
    routeId: string,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  ): Promise<void> => {
    try {
      const response = await apiFetch(`/api/rutas/${encodeURIComponent(routeId)}`, {
        body: JSON.stringify({ status }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: unknown };
        throw new Error(
          typeof payload.error === 'string' ? payload.error : 'No se pudo actualizar la ruta.'
        );
      }

      await loadDashboard();
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : 'No se pudo actualizar la ruta.'
      );
    }
  };

  const recalculateRouteGeometry = async (routeId: string): Promise<void> => {
    setRecalculatingRouteId(routeId);
    setError(null);

    try {
      const response = await apiFetch(`/api/rutas/${encodeURIComponent(routeId)}/recalcular`, {
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo recalcular el trazado vial.'));
      }

      const result = (await response.json()) as { liveTraffic?: LiveTrafficStatus };
      if (result.liveTraffic) {
        setLiveTrafficNotice(summarizeLiveTraffic([result.liveTraffic]));
      }
      await loadDashboard();
    } catch (recalculationError) {
      setError(
        recalculationError instanceof Error
          ? recalculationError.message
          : 'No se pudo recalcular el trazado vial.'
      );
    } finally {
      setRecalculatingRouteId(null);
    }
  };

  const undoRouteRecalculation = async (routeId: string): Promise<void> => {
    setUndoingRouteId(routeId);
    setError(null);
    setRouteActionNotice(null);

    try {
      const response = await apiFetch(`/api/rutas/${encodeURIComponent(routeId)}/deshacer-recalculo`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo restaurar la ruta anterior.'));
      }

      const result = (await response.json()) as { releasedDeliveryPointIds?: unknown };
      const releasedCount = Array.isArray(result.releasedDeliveryPointIds)
        ? result.releasedDeliveryPointIds.length
        : 0;
      setRouteActionNotice(
        releasedCount > 0
          ? `Se restauró la ruta anterior y ${releasedCount} parada${releasedCount === 1 ? ' volvió' : 's volvieron'} a pedidos pendientes.`
          : 'Se restauró el recálculo anterior de la ruta.'
      );
      await loadDashboard();
    } catch (undoError) {
      setError(
        undoError instanceof Error ? undoError.message : 'No se pudo restaurar la ruta anterior.'
      );
    } finally {
      setUndoingRouteId(null);
    }
  };

  const analyzeAssignments = async (): Promise<void> => {
    if (selectedCourierIds.length === 0) {
      setError('Selecciona al menos un repartidor disponible.');
      return;
    }

    if (selectedPendingIds.length === 0) {
      setError('Selecciona al menos un pedido pendiente.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    setLiveTrafficNotice(null);
    setAssignmentPreview([]);
    setAssignmentPreviewSelectionKey(null);
    setUnassignedDeliveryPointIds([]);
    setAssignmentImprovement(null);
    const analyzedSelectionKey = assignmentSelectionKey;

    try {
      const assignmentResponse = await apiFetch('/api/asignaciones', {
        body: JSON.stringify({
          courierIds: selectedCourierIds,
          deliveryPointIds: selectedPendingIds,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!assignmentResponse.ok) {
        throw new Error(await readApiError(assignmentResponse, 'No se pudo asignar el pedido.'));
      }

      const assignmentPayload = (await assignmentResponse.json()) as {
        assignments: Array<{ courierId: string; deliveryPointIds: string[] }>;
        unassignedDeliveryPointIds?: string[];
        ai?: AssignmentAiStatus;
        improvement?: AssignmentImprovement;
      };
      setAssignmentAiStatus(assignmentPayload.ai ?? null);
      setAssignmentImprovement(assignmentPayload.improvement ?? null);
      const unassignedIds = assignmentPayload.unassignedDeliveryPointIds ?? [];
      setUnassignedDeliveryPointIds(unassignedIds);
      const assignments = assignmentPayload.assignments.filter(
        (assignment) => assignment.deliveryPointIds.length > 0
      );

      if (assignments.length === 0 && unassignedIds.length === 0) {
        throw new Error('No hay pedidos asignables para ese repartidor.');
      }

      setAssignmentPreview(assignments);
      setAssignmentPreviewSelectionKey(analyzedSelectionKey);
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : 'No se pudo analizar la asignación.'
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const dispatchAssignments = async (): Promise<void> => {
    if (assignmentPreview.length === 0 || !assignmentPreviewIsCurrent) {
      setError(
        assignmentPreview.length > 0
          ? 'La selección cambió. Vuelve a analizar antes de despachar.'
          : 'Primero analiza una asignación para generar la propuesta de ruta.'
      );
      return;
    }

