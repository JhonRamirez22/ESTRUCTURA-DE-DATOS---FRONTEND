'use client';

import { apiFetch, apiJson, ApiRequestError } from '@/lib/apiClient';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import AppShell from '@/components/AppShell';
import { isCourierLocationFresh } from '@/lib/courierLocation';
import { isRoadGeometryProvider } from '@/lib/roadGeometry';
import { formatNotificationMessage, formatOrderReference } from '@/lib/formatOrderReference';
import { SessionChangeNotice } from "@/components/SessionChangeNotice";
import OptimizationFeed from '@/components/OptimizationFeed';

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

interface CourierAccountDraft {
  courierId: string;
  courierName: string;
  email: string;
  password: string;
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
  const [data, setData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA);
  const [loading, setLoading] = useState(true);
  const [creatingCourier, setCreatingCourier] = useState(false);
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
  const [courierDraft, setCourierDraft] = useState({
    name: '',
    phone: '',
    email: '',
    password: '',
  });
  const [accountDraft, setAccountDraft] = useState<CourierAccountDraft | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
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
        setCourierDraft({ name: '', phone: '', email: '', password: '' });
        setAccountDraft(null);
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

  const createCourier = async (): Promise<void> => {
    if (
      courierDraft.name.trim() === '' ||
      courierDraft.phone.trim() === '' ||
      courierDraft.email.trim() === '' ||
      courierDraft.password.length < 15
    ) {
      setError('Completa nombre, teléfono, correo y contraseña de al menos 15 caracteres.');
      return;
    }

    setCreatingCourier(true);
    setError(null);

    try {
      const response = await apiFetch('/api/repartidores', {
        body: JSON.stringify({
          name: courierDraft.name.trim(),
          phone: courierDraft.phone.trim(),
          account: { email: courierDraft.email.trim(), password: courierDraft.password },
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo registrar el repartidor.'));
      }

      setRouteActionNotice(
        `Cuenta creada para ${courierDraft.email.trim()}. Puede ingresar con su contraseña y activar el GPS.`
      );
      setCourierDraft({ name: '', phone: '', email: '', password: '' });
      await loadDashboard();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'No se pudo registrar el repartidor.'
      );
    } finally {
      setCreatingCourier(false);
    }
  };

  const saveCourierAccount = async (): Promise<void> => {
    if (!accountDraft) return;
    setSavingAccount(true);
    setError(null);
    try {
      const response = await apiFetch('/api/auth/courier-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountDraft),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo guardar el acceso.'));
      }
      setRouteActionNotice(`Acceso actualizado para ${accountDraft.courierName}.`);
      setAccountDraft(null);
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : 'No se pudo guardar el acceso.');
    } finally {
      setSavingAccount(false);
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
    { label: 'Repartidores conectados', value: connectedCourierCount, warning: false },
    { label: 'Rutas activas', value: activeRoutes.length, warning: false },
    { label: 'Paradas activas', value: pendingStops, warning: false },
    {
      label: data.metrics.timeSavedMinutes >= 0 ? 'Minutos ahorrados' : 'Minutos extra',
      value: Math.round(Math.abs(data.metrics.timeSavedMinutes)),
      warning: data.metrics.timeSavedMinutes < 0,
    },
    {
      label: data.metrics.distanceSavedMeters >= 0 ? 'Km ahorrados' : 'Km extra',
      value: Math.round(Math.abs(data.metrics.distanceSavedMeters) / 100) / 10,
      warning: data.metrics.distanceSavedMeters < 0,
    },
  ];

  return (
    <AppShell active="dispatch">
      <main className="rp-dashboard text-slate-950">
        <SessionChangeNotice role="dispatcher" />
        <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8 lg:px-10">
          <OptimizationFeed />
          <header className="rp-page-heading flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Rutas en movimiento
              </h1>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
              <span className="flex items-center gap-2 text-xs text-slate-600 sm:justify-end">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${loading ? 'bg-amber-500' : 'bg-emerald-600'}`}
                />
                {loading
                  ? 'Sincronizando operación…'
                  : lastUpdatedAt
                    ? `Actualizado ${lastUpdatedAt.toLocaleTimeString('es-CO')}`
                    : 'Actualización automática activa'}
              </span>
              <button
                className="rp-button rp-button-quiet w-full sm:w-auto"
                disabled={loading}
                onClick={() => void loadDashboard()}
                type="button"
              >
                {loading ? 'Actualizando…' : 'Actualizar datos'}
              </button>
            </div>
          </header>

          <nav aria-label="Accesos rápidos del despacho" className="rp-mobile-shortcuts">
            <a href="#active-routes">Ver rutas activas</a>
            <a href="#dispatch-orders">Asignar pedidos</a>
          </nav>

          {error ? (
            <div
              className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800"
              role="alert"
            >
              {error}
              {sessionExpired ? (
                <Link href="/acceso?retorno=%2Fdashboard" className="ml-2 font-semibold underline">
                  Volver a ingresar
                </Link>
              ) : null}
            </div>
          ) : null}

          {routeActionNotice ? (
            <p
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
              role="status"
            >
              <span>{routeActionNotice}</span>
              <button
                className="min-h-11 rounded-lg px-2 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                onClick={() => setRouteActionNotice(null)}
                type="button"
              >
                Cerrar
              </button>
            </p>
          ) : null}

          {data.notificationsWarning ? (
            <p
              className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"
              role="status"
            >
              {data.notificationsWarning}
            </p>
          ) : null}

          {dashboardWarning ? (
            <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-950" role="status">
              {dashboardWarning} Los datos secundarios pueden estar desactualizados.
            </p>
          ) : null}
          {!operationalReady && lastUpdatedAt ? (
            <p className="mb-4 text-sm text-amber-950" role="status">
              Datos anteriores. Actualiza los servicios esenciales antes de modificar o despachar.
            </p>
          ) : null}

          <fieldset disabled={!operationalReady} aria-label="Operación de despacho" className="min-w-0 border-0 p-0">

          {accountDraft ? (
            <section
              className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4"
              aria-label="Cuenta de repartidor"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-amber-950">
                    Acceso de {accountDraft.courierName}
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    Correo y contraseña de al menos 15 caracteres.
                  </p>
                </div>
                <button
                  className="text-xs font-semibold text-amber-900 underline"
                  onClick={() => setAccountDraft(null)}
                  type="button"
                >
                  Cancelar
                </button>
              </div>
              <form
                className="mt-3 grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveCourierAccount();
                }}
              >
                <label className="text-sm font-semibold">
                  Correo electrónico
                  <input
                    className="rp-input mt-1"
                    type="email"
                    autoComplete="off"
                    required
                    maxLength={254}
                    value={accountDraft.email}
                    onChange={(event) =>
                      setAccountDraft({ ...accountDraft, email: event.target.value })
                    }
                  />
                </label>
                <label className="text-sm font-semibold">
                  Nueva contraseña
                  <input
                    className="rp-input mt-1"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={15}
                    maxLength={128}
                    value={accountDraft.password}
                    onChange={(event) =>
                      setAccountDraft({ ...accountDraft, password: event.target.value })
                    }
                  />
                </label>
                <button
                  className="rp-button rp-button-primary"
                  type="submit"
                  disabled={savingAccount}
                >
                  {savingAccount ? 'Guardando…' : 'Guardar acceso'}
                </button>
              </form>
            </section>
          ) : null}

          <section
            aria-label="Mapa y rutas activas"
            className="mb-6 grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"
          >
            <div className="rp-map-frame min-w-0">
              <div className="rp-map-heading">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900">Mapa operativo</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">
                    Ubicaciones del equipo y recorridos por calles de Pasto.
                  </p>
                </div>
                <div className="rp-map-legend">
                  <span className="inline-flex whitespace-nowrap items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-cyan-400" />
                    Repartidor
                  </span>
                  <span className="inline-flex whitespace-nowrap items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Pendiente
                  </span>
                  <span className="inline-flex whitespace-nowrap items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />
                    En camino
                  </span>
                  <span className="inline-flex whitespace-nowrap items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Entregada
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
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-slate-900">Rutas activas</h2>
                  <p className="mt-1 text-xs text-slate-500">Recorridos planificados y en curso</p>
                </div>
                <span
                  aria-label={`${activeRoutes.length} rutas activas`}
                  className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                >
                  {activeRoutes.length}
                </span>
              </div>

              <div className="space-y-3">
                {loading && data.routes.length === 0 ? (
                  <p
                    aria-live="polite"
                    className="rounded-2xl bg-slate-50 px-4 py-5 text-sm text-slate-500"
                    role="status"
                  >
                    Cargando rutas activas…
                  </p>
                ) : activeRoutes.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-5">
                    <p className="text-sm leading-6 text-slate-600">
                      No hay recorridos activos.
                    </p>
                    <Link
                      className="mt-3 inline-flex text-xs font-bold text-emerald-800 underline decoration-emerald-300 underline-offset-4 hover:text-emerald-950"
                      href="#dispatch-orders"
                    >
                      Ir al despacho
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
                <details
                  aria-label="Historial de rutas"
                  className="mt-4 border-t border-slate-100 pt-3"
                >
                  <summary className="cursor-pointer rounded-lg py-2 text-xs font-semibold text-slate-600 outline-offset-4 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-emerald-600">
                    Historial de rutas{' '}
                    <span className="ml-1 text-slate-400">({historicalRoutes.length})</span>
                  </summary>
                  <div className="mt-3 space-y-3">
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


          <dl
            aria-label="Resumen operativo"
            className="rp-operational-summary mb-6 grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0"
          >
            {summaryMetrics.map((metric) => (
              <div className="min-w-0 px-3 py-3 sm:px-4" key={metric.label}>
                <dt className="text-xs font-medium leading-5 text-slate-600">{metric.label}</dt>
                <dd
                  className={`mt-1 text-2xl font-semibold tabular-nums ${metric.warning ? 'text-amber-700' : 'text-slate-950'}`}
                >
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>

          {data.notifications.length > 0 ? (
            <section
              aria-label="Avisos operativos"
              className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold text-slate-900">Actividad reciente</h2>
                <span className="text-xs text-slate-500">Avisos del equipo</span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {data.notifications.map((notification) => {
                  const isFailure = notification.kind === 'ROUTE_RECALCULATION_FAILED';
                  return (
                    <article
                      className={`rounded-xl border px-3 py-2 ${isFailure ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-[var(--surface)]'}`}
                      key={notification.id}
                    >
                      <p
                        className={`text-xs font-semibold ${isFailure ? 'text-amber-900' : 'text-slate-800'}`}
                      >
                        {notification.title}
                      </p>
                      <p
                        className={`mt-1 text-xs ${isFailure ? 'text-amber-800' : 'text-slate-600'}`}
                      >
                        {formatNotificationMessage(notification.message)}
                      </p>
                      <time
                        className={`mt-1 block text-[11px] ${isFailure ? 'text-amber-700' : 'text-slate-500'}`}
                      >
                        {new Date(notification.createdAt).toLocaleString('es-CO')}
                      </time>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section
            aria-label="Despachar pedidos"
            className="mb-6 scroll-mt-24 rounded-[1.5rem] border border-slate-200/90 bg-[var(--surface)] p-5  sm:p-6"
            id="dispatch-orders"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">Selecciona, analiza y despacha</h2>
              </div>
              <Link
                className="rp-button rp-button-secondary rp-button-small shrink-0"
                href="/pedidos"
              >
                + Registrar pedido
              </Link>
            </div>


            {liveTrafficNotice ? (
              <div
                className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950"
                role="status"
              >
                <p className="text-sm font-semibold">Estado de tráfico de la ruta</p>
                <p className="mt-1 text-sm leading-5">{liveTrafficNotice}</p>
              </div>
            ) : null}

            <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/40">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">1. Pedidos pendientes</h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {selectedPendingIds.length} de {data.pendingPoints.length} seleccionados
                    </p>
                  </div>
                  <button
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-900"
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
                      ? 'Quitar todos'
                      : 'Seleccionar todos'}
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto p-3">
                  {data.pendingPoints.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 px-3 py-5 text-sm text-slate-500">
                      No hay pedidos pendientes. Registra uno desde el módulo Pedidos.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.pendingPoints.map((point) => {
                        const checked = selectedPendingIds.includes(point.id);
                        const reference = formatOrderReference(point.orderId);
                        return (
                          <article
                            className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-emerald-300 bg-emerald-50' : 'border-slate-100 hover:border-slate-300'}`}
                            key={point.id}
                          >
                            <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                              <input
                                checked={checked}
                                className="mt-1 h-4 w-4 accent-emerald-700"
                                onChange={() =>
                                  setSelectedPendingIds((current) =>
                                    checked
                                      ? current.filter((id) => id !== point.id)
                                      : [...current, point.id]
                                  )
                                }
                                type="checkbox"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-3">
                                  <span className="font-mono text-xs font-bold text-slate-800">
                                    {reference}
                                  </span>
                                  <span className="text-[10px] font-semibold text-amber-700">
                                    Pendiente
                                  </span>
                                </span>
                                <span className="mt-1 block truncate text-xs text-slate-500">
                                  {point.address}
                                </span>
                              </span>
                            </label>
                            <button
                              aria-label={`Eliminar pedido ${reference}`}
                              className="ui-button ui-button-ghost ui-button-icon !h-9 !min-h-9 !w-9 !p-2 text-rose-700 hover:bg-rose-50"
                              disabled={deletingOrderId === point.id || dispatching}
                              onClick={() => void deletePendingOrder(point)}
                              type="button"
                            >
                              {deletingOrderId === point.id ? (
                                <span className="sr-only">Eliminando…</span>
                              ) : null}
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/90 bg-slate-50/40">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-900">2. Repartidores disponibles</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Puedes seleccionar más de uno para balancear la carga.
                  </p>
                </div>
                <div className="p-3">
                  {availableCouriers.length === 0 ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-4 text-xs leading-5 text-amber-800">
                      No hay repartidores con GPS disponible. Registra uno o inicia su PWA.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {availableCouriers.map((courier) => {
                        const checked = selectedCourierIds.includes(courier.id);
                        return (
                          <div className="flex items-center gap-2" key={courier.id}>
                            <label
                              className={`flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${checked ? 'border-sky-300 bg-sky-50' : 'border-slate-100 hover:border-slate-300'}`}
                            >
                              <input
                                checked={checked}
                                className="h-4 w-4 accent-sky-700"
                                onChange={() =>
                                  setSelectedCourierIds((current) =>
                                    checked
                                      ? current.filter((id) => id !== courier.id)
                                      : [...current, courier.id]
                                  )
                                }
                                type="checkbox"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-slate-800">
                                  {courier.name}
                                </span>
                                <span className="block text-[11px] text-slate-500">
                                  GPS activo · {courier.phone}
                                </span>
                              </span>
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <button
                    className="rp-button rp-button-primary mt-4 w-full"
                    disabled={
                      analyzing ||
                      selectedPendingIds.length === 0 ||
                      selectedCourierIds.length === 0
                    }
                    onClick={() => void analyzeAssignments()}
                    type="button"
                  >
                    {analyzing ? 'Analizando cercanía…' : 'Analizar asignación'}
                  </button>
                </div>
              </div>
            </div>

            {assignmentPreview.length > 0 || unassignedDeliveryPointIds.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-emerald-950">
                      {assignmentPreview.length > 0
                        ? '3. Propuesta lista para despachar'
                        : 'Pedidos pendientes de asignar'}
                    </h3>
                    <p className="mt-1 text-xs text-emerald-800">
                      {assignmentPreview.length > 0
                        ? 'Revisa la distribución antes de consultar OSRM y crear las rutas.'
                        : 'No se asignaron pedidos en este análisis; siguen pendientes y no se despacharán.'}
                    </p>
                  </div>
                  {assignmentPreview.length > 0 ? (
                    <button
                      className="rp-button rp-button-primary"
                      disabled={dispatching || !assignmentPreviewIsCurrent}
                      onClick={() => void dispatchAssignments()}
                      type="button"
                    >
                      {dispatching ? 'Calculando ruta y tráfico…' : 'Despachar rutas optimizadas'}
                    </button>
                  ) : null}
                </div>
                {assignmentPreview.length > 0 && !assignmentPreviewIsCurrent ? (
                  <p className="mt-3 text-sm font-medium text-amber-900" role="status">
                    La selección cambió. Vuelve a analizar antes de despachar esta propuesta.
                  </p>
                ) : null}
                {assignmentPreview.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {assignmentPreview.map((assignment) => {
                      const courier = data.couriers.find(
                        (item) => item.id === assignment.courierId
                      );
                      return (
                        <div
                          className="rounded-xl border border-emerald-100 bg-[var(--surface)] p-3"
                          key={assignment.courierId}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-bold text-slate-800">
                              {courier?.name ?? 'Repartidor'}
                            </span>
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">
                              {assignment.deliveryPointIds.length} paradas
                            </span>
                          </div>
                          <ol className="mt-2 space-y-1 text-xs text-slate-600">
                            {assignment.deliveryPointIds.map((id, index) => (
                              <li className="truncate" key={id}>
                                <span className="mr-1 font-bold text-emerald-700">
                                  {index + 1}.
                                </span>
                                {data.pendingPoints.find((point) => point.id === id)?.address ?? id}
                              </li>
                            ))}
                          </ol>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {unassignedDeliveryPointIds.length > 0 ? (
                  <div
                    className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-950"
                    aria-live="polite"
                    role="status"
                  >
                    <p className="font-bold">
                      {unassignedDeliveryPointIds.length === 1
                        ? 'Un pedido sigue sin asignar.'
                        : `${unassignedDeliveryPointIds.length} pedidos siguen sin asignar.`}
                    </p>
                    <p className="mt-1 leading-5 text-amber-900">
                      Puede faltar capacidad de ruta, GPS reciente o el pedido pudo cambiar de
                      estado. Estos pedidos siguen pendientes; no se despacharán.
                    </p>
                    <ul className="mt-2 space-y-1">
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
                  <div
                    className="mt-3 rounded-xl border border-slate-200 bg-[var(--surface)] px-3 py-2 text-xs text-slate-700"
                    role="status"
                  >
                    <span className="font-bold">
                      {assignmentAiStatus.source === 'tomtom-live'
                        ? 'TomTom Traffic Flow priorizado'
                        : assignmentAiStatus.source === 'external-ai' && assignmentAiStatus.applied
                          ? 'Factor de congestión sugerido por IA aplicado'
                          : 'Asignación determinista'}
                      .
                    </span>{' '}
                    {assignmentAiStatus.warning ??
                      'La propuesta se calculó con cercanía y balanceo.'}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    ¿No aparece un repartidor?
                  </h3>
                </div>
              </div>
              <div className="mt-3 grid items-end gap-3 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Nombre completo
                  <input
                    className="rp-input mt-1 px-3 py-2.5 text-sm"
                    onChange={(event) =>
                      setCourierDraft((draft) => ({ ...draft, name: event.target.value }))
                    }
                    placeholder="Ej. Camila Ramírez"
                    value={courierDraft.name}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Teléfono
                  <input
                    className="rp-input mt-1 px-3 py-2.5 text-sm"
                    onChange={(event) =>
                      setCourierDraft((draft) => ({ ...draft, phone: event.target.value }))
                    }
                    placeholder="Ej. 300 123 4567"
                    value={courierDraft.phone}
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Correo electrónico
                  <input
                    className="rp-input mt-1 px-3 py-2.5 text-sm"
                    type="email"
                    autoComplete="off"
                    maxLength={254}
                    value={courierDraft.email}
                    onChange={(event) =>
                      setCourierDraft({ ...courierDraft, email: event.target.value })
                    }
                  />
                </label>
                <label className="block text-xs font-semibold text-slate-700">
                  Contraseña (mínimo 15 caracteres)
                  <input
                    className="rp-input mt-1 px-3 py-2.5 text-sm"
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={128}
                    value={courierDraft.password}
                    onChange={(event) =>
                      setCourierDraft({ ...courierDraft, password: event.target.value })
                    }
                  />
                </label>
                <button
                  className="rp-button rp-button-secondary"
                  disabled={creatingCourier}
                  onClick={() => void createCourier()}
                  type="button"
                >
                  {creatingCourier ? 'Guardando…' : 'Registrar'}
                </button>
              </div>
            </div>

            {data.couriers.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-100 bg-[var(--surface)] p-4">
                <h3 className="text-sm font-semibold text-slate-800">Accesos del equipo</h3>
                <ul className="mt-3 divide-y divide-slate-100">
                  {data.couriers.map((courier) => (
                    <li className="flex items-center justify-between gap-3 py-2.5" key={courier.id}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {courier.name}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {isCourierLocationFresh(
                            courier.lastLocationAt ? new Date(courier.lastLocationAt) : null
                          )
                            ? courier.status === 'AVAILABLE'
                              ? 'Disponible · GPS reciente'
                              : courier.status === 'ON_ROUTE'
                                ? 'En ruta · GPS reciente'
                                : 'Fuera de línea'
                            : courier.lastLocationAt
                              ? `GPS vencido · última lectura ${new Date(courier.lastLocationAt).toLocaleTimeString('es-CO')}`
                              : 'Sin ubicación GPS'}
                        </span>
                      </span>
                      <button
                        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-2 text-[11px] font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-800"
                        onClick={() =>
                          setAccountDraft({
                            courierId: courier.id,
                            courierName: courier.name,
                            email: '',
                            password: '',
                          })
                        }
                        type="button"
                      >
                        Configurar acceso
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
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
  const statusLabels = {
    PLANNED: 'Planificada',
    IN_PROGRESS: 'En progreso',
    COMPLETED: 'Completada',
    CANCELLED: 'Cancelada',
  } as const;
  const statusTone = {
    PLANNED: 'bg-sky-50 text-sky-800',
    IN_PROGRESS: 'bg-emerald-50 text-emerald-800',
    COMPLETED: 'bg-slate-100 text-slate-600',
    CANCELLED: 'bg-slate-100 text-slate-500',
  } as const;
  const hasFreshCourierLocation =
    route.courier.currentLat !== null &&
    route.courier.currentLng !== null &&
    isCourierLocationFresh(
      route.courier.lastLocationAt ? new Date(route.courier.lastLocationAt) : null
    );
  const canRecalculate = route.status === 'PLANNED' || route.status === 'IN_PROGRESS';

  return (
    <article className="rp-route-summary">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-800">{route.courier.name}</p>
          <p className="mt-1 font-mono text-xs text-slate-600">{route.id.slice(0, 8)}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusTone[route.status]}`}
        >
          {statusLabels[route.status]}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div className="py-2">
          <p className="text-slate-600">Duración</p>
          <p className="mt-1 font-semibold text-slate-700">
            {Math.round(route.estimatedDurationMinutes)} min
          </p>
        </div>
        <div className="py-2">
          <p className="text-slate-600">Paradas</p>
          <p className="mt-1 font-semibold text-slate-700">{route.deliveryPoints.length}</p>
        </div>
      </div>
      <div className="mt-3 border-t border-slate-300 pt-3 text-xs">
        <p className="font-semibold text-slate-700">Orden optimizado</p>
        {route.deliveryPoints.length > 0 ? (
          <ol className="mt-2 space-y-2 text-slate-700">
            {route.deliveryPoints.map((point, index) => (
              <li className="flex gap-2 leading-5" key={point.id}>
                <span className="shrink-0 font-semibold tabular-nums">{index + 1}.</span>
                <span className="break-words">{point.address}</span>
              </li>
            ))}
          </ol>
        ) : <p className="mt-2 text-slate-600">Sin paradas</p>}
      </div>
      {canRecalculate && !isRoadGeometryProvider(route.geometryProvider) ? (
        <div
          className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950"
          role="status"
        >
          <p className="font-semibold">Trazado antiguo sin verificar</p>
          <p className="mt-1 leading-5">
            No se mostrará como si siguiera calles. Recalcula la ruta para confirmar su geometría
            con OSRM.
          </p>
          {canRecalculate && hasFreshCourierLocation ? (
            <button
              className="rp-button rp-button-primary rp-button-small mt-2"
              disabled={isRecalculating}
              onClick={() => void onRecalculate(route.id)}
              type="button"
            >
              {isRecalculating ? 'Consultando OSRM…' : 'Recalcular por calles'}
            </button>
          ) : null}
          {canRecalculate && !hasFreshCourierLocation ? (
            <p className="mt-2 leading-5 text-amber-800">
              El repartidor debe compartir una ubicación GPS reciente antes de recalcular.
            </p>
          ) : null}
        </div>
      ) : null}
      {route.status === 'PLANNED' || route.status === 'IN_PROGRESS' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {route.canUndo ? (
            <button
              aria-label={`Deshacer último recálculo de la ruta de ${route.courier.name}`}
              className="rp-button rp-button-secondary rp-button-small"
              disabled={isUndoing || isRecalculating}
              onClick={() => void onUndo(route.id)}
              type="button"
            >
              {isUndoing ? 'Restaurando…' : 'Deshacer último recálculo'}
            </button>
          ) : null}
          {route.status === 'PLANNED' ? (
            <button
              className="rp-button rp-button-primary rp-button-small"
              onClick={() => void onStatusChange(route.id, 'IN_PROGRESS')}
              type="button"
            >
              Iniciar ruta
            </button>
          ) : (
            <button
              className="rp-button rp-button-primary rp-button-small"
              onClick={() => void onStatusChange(route.id, 'COMPLETED')}
              type="button"
            >
              Completar ruta
            </button>
          )}
          <button
            className="rp-button rp-button-danger rp-button-small"
            onClick={() => void onStatusChange(route.id, 'CANCELLED')}
            type="button"
          >
            Cancelar
          </button>
        </div>
      ) : null}
    </article>
  );
}
