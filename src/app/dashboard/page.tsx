'use client';

import { apiFetch, apiJson, ApiRequestError } from '@/lib/apiClient';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { RouteOptimization } from '@/lib/routeOptimization';

const RouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[min(68vh,680px)] min-h-[400px] items-center justify-center bg-[#17242b] text-sm text-slate-300">
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
  const [liveTrafficNotice, setLiveTrafficNotice] = useState<string | null>(null);
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

      if (!selectionInitialized.current) {
        setSelectedCourierIds(availableCourierIds.slice(0, 1));
        setSelectedPendingIds(ordersPayload.deliveryPoints.map((point) => point.id));
        selectionInitialized.current = true;
      } else {
        setSelectedCourierIds((current) =>
          current.filter((id) => availableCourierIds.includes(id))
        );
        setSelectedPendingIds((current) =>
          current.filter((id) => ordersPayload.deliveryPoints.some((point) => point.id === id))
        );
      }

      setData((previous) => ({
        couriers: couriersPayload.couriers,
        notifications: notifications.status === 'fulfilled' && Array.isArray(notifications.value?.notifications)
          ? notifications.value.notifications : previous.notifications,
        notificationsWarning: notifications.status === 'fulfilled' ? notifications.value?.warning ?? null : 'Avisos anteriores; no se pudieron actualizar.',
        pendingPoints: ordersPayload.deliveryPoints,
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
      };
      setAssignmentAiStatus(assignmentPayload.ai ?? null);
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
      setSelectedPendingIds([]);
      await loadDashboard();
    } catch (dispatchError) {
      setError(
        dispatchError instanceof Error ? dispatchError.message : 'No se pudo despachar la ruta.'
      );
    } finally {
      setDispatching(false);
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

          <nav aria-label="Accesos rápidos del despacho" className="rp-mobile-shortcuts">
            <a href="#active-routes">Ver rutas activas</a>
            <a href="#dispatch-orders">Asignar pedidos</a>
          </nav>

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

          <section aria-label="Despachar pedidos" className="rl-section scroll-mt-24" id="dispatch-orders">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

            <div className="rl-columns rl-columns-dispatch items-start gap-y-8">
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
                    onClick={() =>
                      setSelectedPendingIds(
                        selectedPendingIds.length === data.pendingPoints.length
                          ? []
                          : data.pendingPoints.map((point) => point.id)
                      )
                    }
                    type="button"
                  >
                    {selectedPendingIds.length === data.pendingPoints.length &&
                    data.pendingPoints.length > 0
                      ? t('dash.clearAll')
                      : t('dash.selectAll')}
                  </button>
                </div>
                {data.pendingPoints.length === 0 ? (
                  <p className="rl-empty">{t('dash.noPending')}</p>
                ) : (
                  <ul className="rl-rows max-h-[420px] overflow-y-auto">
                    {data.pendingPoints.map((point) => {
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
                <button
                  className="rp-button rp-button-primary rp-button-block mt-4"
                  data-tip="tip.analyze"
                  disabled={analyzing || selectedPendingIds.length === 0 || selectedCourierIds.length === 0}
                  onClick={() => void analyzeAssignments()}
                  type="button"
                >
                  {analyzing ? t('dash.analyzing') : t('dash.analyze')}
                </button>
              </div>

              {assignmentPreview.length > 0 || unassignedDeliveryPointIds.length > 0 ? (
                <aside aria-label="Propuesta" className="rl-board route-proposal min-w-0">
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
                    <div className="mt-4 space-y-5">
                      {assignmentPreview.map((assignment) => {
                        const courier = data.couriers.find((item) => item.id === assignment.courierId);
                        return (
                          <div key={assignment.courierId}>
                            <p className="mb-2 flex items-baseline justify-between gap-3 text-sm font-semibold !text-[var(--board-ink)]">
                              {courier?.name ?? 'Repartidor'}
                              <span className="text-xs font-normal tabular-nums !text-[var(--board-soft)]">
                                {t('dash.stops', { n: assignment.deliveryPointIds.length })}
                              </span>
                            </p>
                            <RouteLine
                              label={`Orden propuesto para ${courier?.name ?? 'el repartidor'}`}
                              selected
                              stops={assignment.deliveryPointIds.map((id) => ({
                                id,
                                label: data.pendingPoints.find((point) => point.id === id)?.address ?? id,
                              }))}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {unassignedDeliveryPointIds.length > 0 ? (
                    <div aria-live="polite" className="mt-5 border-t-2 border-[#c08a2c] pt-3 text-sm" role="status">
                      <p className="font-semibold !text-[var(--board-ink)]">
                        {unassignedDeliveryPointIds.length === 1
                          ? 'Un pedido sigue sin asignar.'
                          : `${unassignedDeliveryPointIds.length} pedidos siguen sin asignar.`}
                      </p>
                      <p className="mt-1 leading-5">
                        Puede faltar capacidad de ruta, GPS reciente o el pedido pudo cambiar de estado. Estos
                        pedidos siguen pendientes; no se despacharán.
                      </p>
                      <ul className="mt-2 space-y-1 text-[var(--board-soft)]">
                        {unassignedDeliveryPointIds.slice(0, 5).map((id) => {
                          const point = data.pendingPoints.find((item) => item.id === id);
                          return (
                            <li className="break-words" key={id}>
                              {point
                                ? `${formatOrderReference(point.orderId)} · ${point.address}`
                                : 'Un pedido seleccionado ya no está disponible.'}
                            </li>
                          );
                        })}
                        {unassignedDeliveryPointIds.length > 5 ? (
                          <li>Y {unassignedDeliveryPointIds.length - 5} más.</li>
                        ) : null}
                      </ul>
                      <button
                        className="rp-button rp-button-quiet rp-button-small mt-3"
                        disabled={loading}
                        onClick={() => {
                          setAssignmentPreview([]);
                          setUnassignedDeliveryPointIds([]);
                          void loadDashboard();
                        }}
                        type="button"
                      >
                        Actualizar pedidos pendientes
                      </button>
                    </div>
                  ) : null}
                  {assignmentAiStatus ? (
                    <p className="mt-4 text-xs leading-5" role="status">
                      <span className="font-semibold !text-[var(--board-ink)]">
                        {assignmentAiStatus.source === 'tomtom-live'
                          ? 'TomTom Traffic Flow priorizado'
                          : assignmentAiStatus.source === 'external-ai' && assignmentAiStatus.applied
                            ? 'Factor de congestión sugerido por IA aplicado'
                            : 'Asignación determinista'}
                        .
                      </span>{' '}
                      {assignmentAiStatus.warning ?? 'La propuesta se calculó con cercanía y balanceo.'}
                    </p>
                  ) : null}
                  {assignmentPreview.length > 0 ? (
                    <button
                      className="rp-button rp-button-go rp-button-block mt-5"
                      data-tip="tip.dispatch"
                      disabled={dispatching || !assignmentPreviewIsCurrent}
                      onClick={() => void dispatchAssignments()}
                      type="button"
                    >
                      {dispatching ? t('dash.dispatching') : t('dash.dispatchBtn')}
                    </button>
                  ) : null}
                </aside>
              ) : (
                <aside aria-label="Propuesta" className="rl-board min-w-0">
                  <div className="rl-head">
                    <h3>{t('dash.step3')}</h3>
                  </div>
                  <p className="mt-3 text-sm">{t('dash.step3.empty')}</p>
                  <p className="mt-4 text-xs leading-5">
                    {t('dash.step3.note')}
                  </p>
                </aside>
              )}
            </div>
          </section>

          <div className="rl-section mt-14 scroll-mt-24" id="en-vivo">
            <section
              aria-label="Mapa y rutas activas"
              className="mb-10 grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]"
            >
              <div className="rp-map-frame min-w-0">
                <div className="rp-map-heading">
                  <div className="min-w-0">
                    <h2>{t('dash.map')}</h2>
                    <p className="mt-1 max-w-3xl">{t('dash.map.lead')}</p>
                  </div>
                  <div className="rp-map-legend">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full bg-cyan-400" />
                      {t('dash.legend.courier')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      {t('dash.legend.pending')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full bg-sky-400" />
                      {t('dash.legend.onway')}
                    </span>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      {t('dash.legend.delivered')}
                    </span>
                  </div>
                </div>
                <RouteMap
                  showTraffic={activeRoutes.length > 0}
                  couriers={data.couriers}
                  pendingPoints={data.pendingPoints}
                  routes={activeRoutes}
                />
              </div>

              <aside className="rp-route-list min-w-0" id="active-routes">
                <div className="rl-head">
                  <h2>
                    {t('dash.activeRoutes')} <small aria-label={`${activeRoutes.length} rutas activas`}>{activeRoutes.length}</small>
                  </h2>
                </div>
                <div>
                  {loading && data.routes.length === 0 ? (
                    <p aria-live="polite" className="rl-empty" role="status">
                      Cargando rutas activas…
                    </p>
                  ) : activeRoutes.length === 0 ? (
                    <div className="rl-empty">
                      <p>{t('dash.noRoutes')}</p>
                      <Link className="mt-2 inline-flex font-semibold underline underline-offset-4" href="#dispatch-orders">
                        {t('dash.goDispatch')}
                      </Link>
                    </div>
                  ) : (
                    activeRoutes.map((route) => (
                      <RouteSummary
                        key={route.id}
                        isRecalculating={recalculatingRouteId === route.id}
                        isUndoing={undoingRouteId === route.id}
                        onRecalculate={recalculateRouteGeometry}
                        onUndo={undoRouteRecalculation}
                        onStatusChange={updateRouteStatus}
                        route={route}
                      />
                    ))
                  )}
                </div>
                {historicalRoutes.length > 0 ? (
                  <details aria-label="Historial de rutas" className="mt-4">
                    <summary className="cursor-pointer py-2 text-sm font-semibold text-[var(--ink-soft)] hover:text-[var(--foreground)]">
                      {t('dash.history')} <span className="ml-1">({historicalRoutes.length})</span>
                    </summary>
                    <div className="mt-2">
                      {historicalRoutes.map((route) => (
                        <RouteSummary
                          key={route.id}
                          isRecalculating={false}
                          isUndoing={false}
                          onRecalculate={recalculateRouteGeometry}
                          onUndo={undoRouteRecalculation}
                          onStatusChange={updateRouteStatus}
                          route={route}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </aside>
            </section>

            <OptimizationFeed />

            {data.notifications.length > 0 ? (
              <section aria-label="Avisos operativos" className="rl-section">
                <div className="rl-head">
                  <h2>
                    {t('dash.activity')} <small>{t('dash.activity.meta')}</small>
                  </h2>
                </div>
                <ul className="rl-rows">
                  {data.notifications.map((notification) => {
                    const isFailure = notification.kind === 'ROUTE_RECALCULATION_FAILED';
                    return (
                      <li className="rl-row items-start" key={notification.id}>
                        <span className={`rl-state mt-1 ${isFailure ? 'is-warn' : 'is-muted'}`} aria-hidden="true" />
                        <span className="rl-row-main">
                          <strong className={isFailure ? 'text-[var(--warn)]' : undefined}>{notification.title}</strong>
                          <span>{formatNotificationMessage(notification.message)}</span>
                        </span>
                        <time className="shrink-0 text-xs tabular-nums text-[var(--ink-soft)]">
                          {new Date(notification.createdAt).toLocaleString('es-CO')}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
          </div>
          </fieldset>
        </div>
      </main>
    </AppShell>
  );
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === 'string' ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

function summarizeLiveTraffic(statuses: LiveTrafficStatus[]): string {
  const configured = statuses.some((status) => status.configured);
  const routeSegments = statuses.reduce((total, status) => total + status.routeSegments, 0);
  const sampledSegments = statuses.reduce((total, status) => total + status.sampledSegments, 0);
  const adjustedSegments = statuses.reduce((total, status) => total + status.adjustedSegments, 0);
  const closedSegments = statuses.reduce((total, status) => total + status.closedSegments, 0);
  const warnings = [...new Set(statuses.map((status) => status.warning).filter(Boolean))];
  const sourceSummary = configured
    ? `TomTom midió ${sampledSegments} de ${routeSegments} tramos y ajustó ${adjustedSegments}${closedSegments > 0 ? `; marcó ${closedSegments} como cerrados` : ''}.`
    : 'Sin tráfico en vivo; se usaron los tiempos de base.';
  return [sourceSummary, ...warnings].join(' ');
}

function RouteSummary({
  isUndoing,
  isRecalculating,
  onRecalculate,
  onUndo,
  onStatusChange,
  route,
}: {
  isRecalculating: boolean;
  isUndoing: boolean;
  onRecalculate: (routeId: string) => Promise<void>;
  onUndo: (routeId: string) => Promise<void>;
  onStatusChange: (
    routeId: string,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  ) => Promise<void>;
  route: Route;
}) {
  const t = useT();
  const statusLabels = {
    PLANNED: t('route.planned'),
    IN_PROGRESS: t('route.inProgress'),
    COMPLETED: t('route.completed'),
    CANCELLED: t('route.cancelled'),
  } as const;
  const hasFreshCourierLocation =
    route.courier.currentLat !== null &&
    route.courier.currentLng !== null &&
    isCourierLocationFresh(
      route.courier.lastLocationAt ? new Date(route.courier.lastLocationAt) : null
    );
  const canRecalculate = route.status === 'PLANNED' || route.status === 'IN_PROGRESS';
  const firstOpen = route.deliveryPoints.findIndex(
    (point) => point.status !== 'DELIVERED' && point.status !== 'FAILED'
  );
  const stopState = (index: number): Exclude<StopState, 'terminal'> => {
    const status = route.deliveryPoints[index]?.status;
    if (status === 'DELIVERED' || status === 'FAILED') return 'done';
    return index === firstOpen && route.status === 'IN_PROGRESS' ? 'current' : 'pending';
  };
  const delivered = route.deliveryPoints.filter((point) => point.status === 'DELIVERED').length;
  const stateTone =
    route.status === 'IN_PROGRESS' ? 'is-route' : route.status === 'PLANNED' ? '' : 'is-muted';

  return (
    <article className="rp-route-summary">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{route.courier.name}</p>
          <p className="mt-0.5 text-xs tabular-nums text-[var(--ink-soft)]">
            {t('route.meta', {
              id: route.id.slice(0, 8),
              min: Math.round(route.estimatedDurationMinutes),
              done: delivered,
              total: route.deliveryPoints.length,
            })}
          </p>
        </div>
        <span className={`rl-state ${stateTone}`}>{statusLabels[route.status]}</span>
      </div>
      {route.deliveryPoints.length > 0 ? (
        <>
          <div className="mt-3">
            <RouteStrip
              label={`Progreso de la ruta de ${route.courier.name}`}
              states={route.deliveryPoints.map((_, index) => stopState(index))}
            />
          </div>
          <p className="mt-4 text-xs font-semibold text-[var(--ink-soft)]">{t('route.order')}</p>
          <div className="mt-2">
            <RouteLine
              label={`Paradas de la ruta de ${route.courier.name}`}
              stops={route.deliveryPoints.map((point, index) => ({
                id: point.id,
                label: point.address,
                meta: point.status === 'FAILED' ? 'No entregada' : undefined,
                aside: index + 1,
                state: stopState(index),
              }))}
            />
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-[var(--ink-soft)]">{t('route.noStops')}</p>
      )}
      {canRecalculate ? (
        route.optimization ? (
          <OptimizationLadder optimization={route.optimization} routeId={route.id} />
        ) : (
          <p className="mt-3 text-xs text-[var(--ink-soft)]">{t('opt.unavailable')}</p>
        )
      ) : null}
      {canRecalculate && !isRoadGeometryProvider(route.geometryProvider) ? (
        <div className="rl-notice is-warn mt-3 !block text-sm" role="status">
          <p className="font-semibold">Trazado antiguo sin verificar</p>
          <p className="mt-1 leading-5">
            No se mostrará como si siguiera calles. Recalcula la ruta para confirmar su geometría
            con OSRM.
          </p>
          {hasFreshCourierLocation ? (
            <button
              className="rp-button rp-button-primary rp-button-small mt-2"
              data-tip="tip.recalculate"
              disabled={isRecalculating}
              onClick={() => void onRecalculate(route.id)}
              type="button"
            >
              {isRecalculating ? 'Consultando OSRM…' : 'Recalcular por calles'}
            </button>
          ) : (
            <p className="mt-2 leading-5">
              El repartidor debe compartir una ubicación GPS reciente antes de recalcular.
            </p>
          )}
        </div>
      ) : null}
      {route.status === 'PLANNED' || route.status === 'IN_PROGRESS' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {route.status === 'PLANNED' ? (
            <button
              className="rp-button rp-button-primary rp-button-small"
              data-tip="tip.startRoute"
              onClick={() => void onStatusChange(route.id, 'IN_PROGRESS')}
              type="button"
            >
              {t('route.start')}
            </button>
          ) : (
            <button
              className="rp-button rp-button-primary rp-button-small"
              data-tip="tip.completeRoute"
              onClick={() => void onStatusChange(route.id, 'COMPLETED')}
              type="button"
            >
              {t('route.complete')}
            </button>
          )}
          {route.canUndo ? (
            <button
              aria-label={`Deshacer último recálculo de la ruta de ${route.courier.name}`}
              className="rp-button rp-button-quiet rp-button-small"
              data-tip="tip.undo"
              disabled={isUndoing || isRecalculating}
              onClick={() => void onUndo(route.id)}
              type="button"
            >
              {isUndoing ? 'Restaurando…' : t('route.undo')}
            </button>
          ) : null}
          <button
            className="rp-button rp-button-danger rp-button-small ml-auto"
            data-tip="tip.cancelRoute"
            onClick={() => void onStatusChange(route.id, 'CANCELLED')}
            type="button"
          >
            {t('route.cancel')}
          </button>
        </div>
      ) : null}
    </article>
  );
}
