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

    setDispatching(true);
    setError(null);

    try {
      const routeResponse = await apiFetch('/api/asignaciones/aplicar', {
        body: JSON.stringify({ assignments: assignmentPreview }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!routeResponse.ok) {
        throw new Error(await readApiError(routeResponse, 'No se pudo optimizar la ruta.'));
      }

      const routePayload = (await routeResponse.json()) as {
        routes?: Array<{
          trafficAi?: AssignmentAiStatus;
          liveTraffic?: LiveTrafficStatus;
        }>;
      };
      const trafficSummaries = (routePayload.routes ?? [])
        .map((route) => route.liveTraffic)
        .filter((status): status is LiveTrafficStatus => status !== undefined);
      if (trafficSummaries.length > 0) {
        setLiveTrafficNotice(summarizeLiveTraffic(trafficSummaries));
      }
      const routeAiStatus = routePayload.routes?.find(
        (route) => route.trafficAi !== undefined
      )?.trafficAi;
      if (routeAiStatus !== undefined) {
        setAssignmentAiStatus(routeAiStatus);
      }

      setAssignmentPreview([]);
      setAssignmentPreviewSelectionKey(null);
      setUnassignedDeliveryPointIds([]);
      setAssignmentImprovement(null);
      setSelectedPendingIds([]);
      setSheetTab('rutas');
      await loadDashboard();
    } catch (dispatchError) {
      setError(
        dispatchError instanceof Error ? dispatchError.message : 'No se pudo despachar la ruta.'
      );
    } finally {
      setDispatching(false);
    }
  };

  const [markingReadyId, setMarkingReadyId] = useState<string | null>(null);
  const [readyError, setReadyError] = useState<string | null>(null);

  /** Quita la programación: el pedido pasa a la cola de despacho; sigue siendo decisión del despacho. */
  const markReady = async (point: DeliveryPoint): Promise<void> => {
    setMarkingReadyId(point.id);
    setReadyError(null);
    try {
      const response = await apiFetch(`/api/pedidos/${encodeURIComponent(point.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledFor: null }),
      });
      if (!response.ok) throw new Error('failed');
      await loadDashboard();
    } catch {
      setReadyError(t('dash.scheduled.readyError'));
    } finally {
      setMarkingReadyId(null);
    }
  };

  const deletePendingOrder = async (point: DeliveryPoint): Promise<void> => {
    if (
      !window.confirm(
        `¿Eliminar el pedido ${formatOrderReference(point.orderId)}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    setDeletingOrderId(point.id);
    setError(null);
    try {
      const response = await apiFetch(`/api/pedidos/${encodeURIComponent(point.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo eliminar el pedido.'));
      }

      setSelectedPendingIds((current) => current.filter((id) => id !== point.id));
      setAssignmentPreview([]);
      setAssignmentPreviewSelectionKey(null);
      setUnassignedDeliveryPointIds([]);
      await loadDashboard();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'No se pudo eliminar el pedido. Si ya fue asignado, conserva su historial.'
      );
      await loadDashboard();
    } finally {
      setDeletingOrderId(null);
    }
  };

  const availableCouriers = data.couriers.filter(
    (courier) =>
      courier.status === 'AVAILABLE' &&
      courier.currentLat !== null &&
      courier.currentLng !== null &&
      isCourierLocationFresh(courier.lastLocationAt ? new Date(courier.lastLocationAt) : null)
  );
  const connectedCourierCount = data.couriers.filter(
    (courier) =>
      courier.status !== 'OFFLINE' &&
      isCourierLocationFresh(courier.lastLocationAt ? new Date(courier.lastLocationAt) : null)
  ).length;
  const summaryMetrics: Array<{ label: string; value: number; warning: boolean }> = [
    { label: t('dash.fig.connected'), value: connectedCourierCount, warning: false },
    { label: t('dash.fig.routes'), value: activeRoutes.length, warning: false },
    { label: t('dash.fig.stops'), value: pendingStops, warning: false },
    {
      label: data.metrics.timeSavedMinutes >= 0 ? t('dash.fig.savedMin') : t('dash.fig.extraMin'),
      value: Math.round(Math.abs(data.metrics.timeSavedMinutes)),
      warning: data.metrics.timeSavedMinutes < 0,
    },
    {
      label: data.metrics.distanceSavedMeters >= 0 ? t('dash.fig.savedKm') : t('dash.fig.extraKm'),
      value: Math.round(Math.abs(data.metrics.distanceSavedMeters) / 100) / 10,
      warning: data.metrics.distanceSavedMeters < 0,
    },
  ];

  const discardProposal = () => {
    const previous = {
      preview: assignmentPreview,
      selectionKey: assignmentPreviewSelectionKey,
      unassigned: unassignedDeliveryPointIds,
      aiStatus: assignmentAiStatus,
    };
    setAssignmentPreview([]);
    setAssignmentPreviewSelectionKey(null);
    setUnassignedDeliveryPointIds([]);
    setAssignmentAiStatus(null);
    setAssignmentImprovement(null);
    undoToast.show(t('dash.undo.discarded'), () => {
      setAssignmentPreview(previous.preview);
      setAssignmentPreviewSelectionKey(previous.selectionKey);
      setUnassignedDeliveryPointIds(previous.unassigned);
      setAssignmentAiStatus(previous.aiStatus);
    });
  };

  const flow = dispatchFlow({
    pendingCount: data.pendingPoints.length,
    selectedOrders: selectedPendingIds.length,
    availableCouriers: availableCouriers.length,
    selectedCouriers: selectedCourierIds.length,
    analyzing,
    dispatching,
    hasProposal: assignmentPreview.length > 0,
    proposalIsCurrent: assignmentPreviewIsCurrent,
  });
  const flowCounts = {
    orders: selectedPendingIds.length,
    couriers: selectedCourierIds.length,
    pending: data.pendingPoints.length,
    availableCouriers: availableCouriers.length,
  };
  // Con propuesta, el botón cuenta lo que se va a despachar, no lo marcado en las listas.
  const dispatchCounts =
    assignmentPreview.length > 0 && flow.actionIsDispatch
      ? {
          ...flowCounts,
          orders: assignmentPreview.reduce((sum, item) => sum + item.deliveryPointIds.length, 0),
          couriers: assignmentPreview.length,
        }
      : flowCounts;

  const sheetFoot =
    sheetTab === 'pedidos' ? (
      <DispatchAction
        counts={dispatchCounts}
        flow={flow}
        onAct={() => void (flow.actionIsDispatch ? dispatchAssignments() : analyzeAssignments())}
        onBack={discardProposal}
      />
    ) : undefined;

  return (
    <AppShell active="dispatch">
      <main className="rp-dashboard">
        <SessionChangeNotice role="dispatcher" />
        <div className="rl-page">
          <header className="rl-page-head">
            <div>
              <h1>{t('dash.title')}</h1>
              <p className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${loading ? 'bg-amber-500' : 'bg-[var(--route)]'}`}
                />
                {loading
                  ? t('dash.syncing')
                  : lastUpdatedAt
                    ? t('dash.updated', { time: lastUpdatedAt.toLocaleTimeString(lang === 'en' ? 'en-US' : 'es-CO') })
                    : t('dash.autoRefresh')}
              </p>
            </div>
            <dl aria-label="Resumen operativo" className="rl-figures">
              {summaryMetrics.map((metric) => (
                <div key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd className={metric.warning ? 'is-warn' : undefined}>{metric.value}</dd>
                </div>
              ))}
            </dl>
            <DemoGpsButton onRenewed={() => void loadDashboard()} />
            <button
              className="rp-button rp-button-quiet w-full sm:w-auto"
              data-tip="tip.refresh"
              disabled={loading}
              onClick={() => void loadDashboard()}
              type="button"
            >
              {loading ? t('dash.refreshing') : t('dash.refresh')}
            </button>
          </header>


          <div className="mb-6 empty:hidden">
            {error ? (
              <div className="rl-notice is-error" role="alert">
                <span>
                  {error}
                  {sessionExpired ? (
                    <Link href="/acceso?retorno=%2Fdashboard" className="ml-2 font-semibold underline">
                      Volver a ingresar
                    </Link>
                  ) : null}
                </span>
              </div>
            ) : null}
            {routeActionNotice ? (
              <p className="rl-notice is-ok" role="status">
                <span>{routeActionNotice}</span>
                <button
                  className="min-h-11 px-2 font-semibold underline underline-offset-4"
                  onClick={() => setRouteActionNotice(null)}
                  type="button"
                >
                  Cerrar
                </button>
              </p>
            ) : null}
            {data.notificationsWarning ? (
              <p className="rl-notice is-warn" role="status">
                {data.notificationsWarning}
              </p>
            ) : null}
            {dashboardWarning ? (
              <p className="rl-notice is-warn" role="status">
                {dashboardWarning} Los datos secundarios pueden estar desactualizados.
              </p>
            ) : null}
            {!operationalReady && lastUpdatedAt ? (
              <p className="rl-notice is-warn" role="status">
                Datos anteriores. Actualiza los servicios esenciales antes de modificar o despachar.
              </p>
            ) : null}
            {liveTrafficNotice ? (
              <div className="rl-notice is-ok" role="status">
                <span>
                  <strong>Estado de tráfico de la ruta.</strong> {liveTrafficNotice}
                </span>
              </div>
            ) : null}
          </div>

          <fieldset disabled={!operationalReady} aria-label="Operación de despacho" className="min-w-0 border-0 p-0">
          <section
            aria-label="Mapa y rutas activas"
            className={`rp-stage ${stageWide ? 'is-wide' : ''}`}
            id="dispatch-orders"
          >
            <RouteMap
              className="absolute inset-0 h-full w-full"
              couriers={data.couriers}
              inset={inset}
              pendingPoints={[...data.pendingPoints, ...data.scheduledPoints]}
              liveProposal={live.proposal}
              routeColors={routeColors}
              routes={activeRoutes}
              showTraffic={activeRoutes.length > 0}
            />
            <div className="rp-stage-bar" aria-label={t('dash.map')}>
              <span className="rp-chip"><span className="h-2 w-2 rounded-full bg-cyan-400" />{t('dash.legend.courier')}</span>
              <span className="rp-chip"><span className="h-2 w-2 rounded-full bg-amber-500" />{t('dash.legend.pending')}</span>
              <span className="rp-chip"><span className="h-2 w-2 rounded-full bg-sky-400" />{t('dash.legend.onway')}</span>
              <span className="rp-chip"><span className="h-2 w-2 rounded-full bg-green-500" />{t('dash.legend.delivered')}</span>
            </div>
            <LiveOptimizationHud
              applying={applyingLive}
              onApplyAll={() => void applyAllLive()}
              routes={activeRoutes.map((route) => ({
                id: route.id,
                courierName: route.courier.name,
                color: routeColors[route.id] ?? '#55f26b',
              }))}
              state={live}
            />
            <Sheet
              foot={sheetFoot}
              grabberLabel={t('dash.sheet.grabber')}
              head={
                <SegmentedTabs
                  idPrefix="dispatch-sheet"
                  label={t('dash.sheet.tabs')}
                  onChange={setSheetTab}
                  tabs={[
                    { id: 'pedidos', label: t('dash.tab.orders'), count: data.pendingPoints.length },
                    { id: 'rutas', label: t('dash.tab.routes'), count: activeRoutes.length },
                    { id: 'actividad', label: t('dash.tab.activity') },
                  ]}
                  value={sheetTab}
                />
              }
              label={t('dash.title')}
              onLayout={handleSheetLayout}
              peek={176}
            >
              <div aria-labelledby={`dispatch-sheet-tab-${sheetTab}`} id="dispatch-sheet-panel" role="tabpanel">
                {sheetTab === 'pedidos' ? (
                  <section aria-label="Despachar pedidos">
            <DispatchSteps counts={dispatchCounts} flow={flow} />
            <div className={`dispatch-new-head mb-4 flex flex-wrap items-center justify-between gap-3 ${assignmentPreview.length > 0 ? 'hidden' : ''}`}>
              <h2 className="text-xl font-semibold">{t('dash.new')}</h2>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <Link className="font-semibold underline-offset-4 hover:underline" href="/personal">
                  {t('dash.missingCourier')}
                </Link>
                <Link className="rp-button rp-button-secondary rp-button-small shrink-0" data-tip="tip.registerOrder" href="/pedidos">
                  {t('dash.registerOrder')}
                </Link>
              </div>
            </div>
                    <div className="grid gap-8">
                      {analyzing ? (
                        <div aria-busy="true" aria-label={t('dash.analyzing')} className="rl-board order-first grid gap-3" role="status">
                          <p className="font-semibold !text-[var(--board-ink)]">{t('dash.analyzing')}</p>
                          <div className="rp-skeleton h-4 !bg-white/15" />
                          <div className="rp-skeleton h-16 !bg-white/15" />
                        </div>
                      ) : null}
              <div className="min-w-0">
                <div className="rl-head">
                  <h3>
                    {t('dash.step1')}{' '}
                    <small>
                      {t('dash.selected', { n: selectedPendingIds.length, total: data.pendingPoints.length })}
                    </small>
                  </h3>
                  <button
                    className="text-sm font-semibold underline-offset-4 hover:underline"
                    data-tip="tip.selectAll"
                    onClick={() => {
                      const clearing =
                        selectedPendingIds.length === data.pendingPoints.length && data.pendingPoints.length > 0;
                      if (clearing) {
                        const previous = selectedPendingIds;
                        setSelectedPendingIds([]);
                        undoToast.show(t('dash.undo.cleared'), () => setSelectedPendingIds(previous));
                        return;
                      }
                      setSelectedPendingIds(data.pendingPoints.map((point) => point.id));
                    }}
                    type="button"
                  >
                    {selectedPendingIds.length === data.pendingPoints.length &&
                    data.pendingPoints.length > 0
                      ? t('dash.clearAll')
                      : t('dash.selectAll')}
                  </button>
                </div>
                {loading && !lastUpdatedAt && data.pendingPoints.length === 0 ? (
                  <div aria-busy="true" aria-label={t('dash.syncing')} className="grid gap-2 py-2" role="status">
                    <div className="rp-skeleton h-14" />
                    <div className="rp-skeleton h-14" />
                    <div className="rp-skeleton h-14" />
                  </div>
                ) : data.pendingPoints.length === 0 ? (
                  <p className="rl-empty">{t('dash.noPending')}</p>
                ) : (
                  <ul className="rl-rows">
                    {(showAllOrders ? data.pendingPoints : data.pendingPoints.slice(0, COLLAPSED_ORDERS)).map((point) => {
                      const checked = selectedPendingIds.includes(point.id);
                      const reference = formatOrderReference(point.orderId);
                      return (
                        <li className={`rl-row ${checked ? 'is-selected' : ''}`} key={point.id}>
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                            <input
                              checked={checked}
                              className="h-[18px] w-[18px] shrink-0"
                              onChange={() =>
                                setSelectedPendingIds((current) =>
                                  checked
                                    ? current.filter((id) => id !== point.id)
                                    : [...current, point.id]
                                )
                              }
                              type="checkbox"
                            />
                            <span className="rl-row-main">
                              <strong className="truncate">{point.address}</strong>
                              <span className="rl-ref">
                                {reference} · {t('dash.pendingTag')}
                                {point.orderId.startsWith('SIM-') ? ` · ${t('demo.simulated')}` : ''}
                                {orderBadges(point, { high: t('orders.priority.high'), urgent: t('orders.priority.urgent') }).map((part) => ` · ${part}`).join('')}
                                {point.scheduleState === 'overdue' ? ` · ${t('dash.schedule.overdue')} ${formatBogota(point.scheduledFor, lang)}` : ''}
                                {point.scheduleState === 'due-soon' ? ` · ${t('dash.schedule.dueSoon')} ${formatBogota(point.scheduledFor, lang)}` : ''}
                              </span>
                            </span>
                          </label>
                          <button
                            aria-label={`Eliminar pedido ${reference}`}
                            data-tip="tip.deleteOrder"
                            className="ui-button ui-button-ghost ui-button-icon ml-2 !h-10 !min-h-10 !w-10 !p-2 text-[var(--danger)] hover:bg-[var(--danger-band)]"
                            disabled={deletingOrderId === point.id || dispatching}
                            onClick={() => void deletePendingOrder(point)}
                            type="button"
                          >
                            {deletingOrderId === point.id ? <span className="sr-only">Eliminando…</span> : null}
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {data.pendingPoints.length > COLLAPSED_ORDERS ? (
                  <button
                    aria-expanded={showAllOrders}
                    className="rp-button rp-button-quiet rp-button-small mt-2"
                    onClick={() => setShowAllOrders((open) => !open)}
                    type="button"
                  >
                    {showAllOrders
                      ? t('dash.showFewer')
                      : t('dash.showAll', { n: data.pendingPoints.length })}
                  </button>
                ) : null}
                {data.pendingPoints.filter((point) => point.scheduleState).length > 0 ? (
                  <p className="rl-notice is-warn mt-3" role="status">
                    {t('dash.schedule.notice', { n: data.pendingPoints.filter((point) => point.scheduleState).length })}
                  </p>
                ) : null}
                <div className="mt-4">
                  <div className="rl-head">
                    <h3>
                      {t('dash.scheduled.title')} <small>{data.scheduledPoints.length}</small>
                    </h3>
                  </div>
                  {readyError ? <p className="rl-notice is-error" role="alert">{readyError}</p> : null}
                  {data.scheduledPoints.length === 0 ? (
                    <p className="rl-empty">{t('dash.scheduled.empty')}</p>
                  ) : (
                    <ul className="rl-rows">
                      {data.scheduledPoints.map((point) => (
                        <li className="rl-row" key={point.id}>
                          <span className="rl-row-main">
                            <strong className="truncate">{point.address}</strong>
                            <span className="rl-ref">
                              {formatOrderReference(point.orderId)} · {formatBogota(point.scheduledFor, lang)}
                            </span>
                          </span>
                          <button
                            className="rp-button rp-button-secondary rp-button-small"
                            disabled={markingReadyId === point.id}
                            onClick={() => void markReady(point)}
                            type="button"
                          >
                            {t('dash.scheduled.ready')}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <DispatchSuggestions onSelect={(ids) => setSelectedPendingIds(ids)} refreshKey={data.pendingPoints.length} />
                <AiGroupSuggestions onSelect={(ids) => setSelectedPendingIds(ids)} />
              </div>
              <div className="min-w-0">
                <div className="rl-head">
                  <h3>
                    {t('dash.step2')} <small>{t('dash.recentGps')}</small>
                  </h3>
                </div>
                {availableCouriers.length === 0 ? (
                  <p className="rl-empty">{t('dash.noCouriers')}</p>
                ) : (
                  <ul className="rl-rows">
                    {availableCouriers.map((courier) => {
                      const checked = selectedCourierIds.includes(courier.id);
                      return (
                        <li className={`rl-row ${checked ? 'is-selected' : ''}`} key={courier.id}>
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                            <input
                              checked={checked}
                              className="h-[18px] w-[18px] shrink-0"
                              onChange={() =>
                                setSelectedCourierIds((current) =>
                                  checked
                                    ? current.filter((id) => id !== courier.id)
                                    : [...current, courier.id]
                                )
                              }
                              type="checkbox"
                            />
                            <span className="rl-row-main">
                              <strong>{courier.name}</strong>
                              <span className="tabular-nums">{t('dash.gpsActive')} · {courier.phone}</span>
                            </span>
                            <span className="rl-state is-route">{t('dash.free')}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-3 text-xs text-[var(--ink-soft)]">
                  {t('dash.multi')}
                </p>
              </div>
              {assignmentPreview.length > 0 || unassignedDeliveryPointIds.length > 0 ? (
                <aside aria-label="Propuesta" className="rl-board route-proposal order-first min-w-0">
                  <div className="rl-head">
                    <h3>
                      {assignmentPreview.length > 0 ? t('dash.step3.ready') : t('dash.step3.unassigned')}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm">
                    {assignmentPreview.length > 0
                      ? t('dash.step3.review')
                      : t('dash.step3.none')}
                  </p>
                  {assignmentPreview.length > 0 && !assignmentPreviewIsCurrent ? (
                    <p className="mt-3 text-sm font-semibold !text-[#f3d9a4]" role="status">
                      {t('dash.stale')}
                    </p>
                  ) : null}
                  {assignmentPreview.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {assignmentPreview.map((assignment) => {
                        const courier = data.couriers.find((item) => item.id === assignment.courierId);
                        return (
                          <div key={assignment.courierId}>
                            <p className="mb-2 flex items-baseline justify-between gap-3 text-sm font-semibold !text-[var(--board-ink)]">
                              {courier?.name ?? 'Repartidor'}
                              <span className="text-xs font-normal tabular-nums !text-[var(--board-soft)]">
                                {t(assignment.deliveryPointIds.length === 1 ? 'dash.stops.one' : 'dash.stops', { n: assignment.deliveryPointIds.length })}
                              </span>
                            </p>
                            <details>
