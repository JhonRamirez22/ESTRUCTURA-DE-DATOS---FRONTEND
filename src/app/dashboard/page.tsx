'use client';

import { apiFetch } from '@/lib/apiClient';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { isCourierLocationFresh } from '@/lib/courierLocation';
import { isRoadGeometryProvider } from '@/lib/roadGeometry';
import { formatNotificationMessage, formatOrderReference } from '@/lib/formatOrderReference';
import CustomerNotificationReadiness, {
  isCustomerNotificationOperationsStatus,
  type CustomerNotificationOperationsStatus,
} from '@/components/CustomerNotificationReadiness';
import RoutingMethodology from '@/components/RoutingMethodology';

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

interface CustomerNotificationSummary {
  queued: number;
  channels: {
    email: { queued: number; configured: boolean };
    sms: { queued: number; configured: boolean };
  };
  warning?: string | null;
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
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
  });
  const [loading, setLoading] = useState(true);
  const [creatingCourier, setCreatingCourier] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [recalculatingRouteId, setRecalculatingRouteId] = useState<string | null>(null);
  const [undoingRouteId, setUndoingRouteId] = useState<string | null>(null);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [selectedCourierIds, setSelectedCourierIds] = useState<string[]>([]);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentProposal[]>([]);
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
  const [routeActionNotice, setRouteActionNotice] = useState<string | null>(null);
  const [assignmentAiStatus, setAssignmentAiStatus] = useState<AssignmentAiStatus | null>(null);
  const [liveTrafficNotice, setLiveTrafficNotice] = useState<string | null>(null);
  const [customerNotificationSummary, setCustomerNotificationSummary] =
    useState<CustomerNotificationSummary | null>(null);
  const [customerNotificationOperationsStatus, setCustomerNotificationOperationsStatus] =
    useState<CustomerNotificationOperationsStatus | null>(null);
  const [customerNotificationOperationsUnavailable, setCustomerNotificationOperationsUnavailable] =
    useState(false);
  const dashboardRequestId = useRef(0);

  const loadDashboard = useCallback(async () => {
    const requestId = ++dashboardRequestId.current;
    setLoading(true);
    setError(null);

    try {
      const [
        couriersResponse,
        notificationsResponse,
        ordersResponse,
        routesResponse,
        analyticsResponse,
        customerNotificationStatusResponse,
      ] = await Promise.all([
        apiFetch('/api/repartidores', { cache: 'no-store' }),
        apiFetch('/api/notificaciones?recipientId=dispatcher&limit=5', {
          cache: 'no-store',
        }),
        apiFetch('/api/pedidos?status=PENDING', { cache: 'no-store' }),
        apiFetch('/api/rutas', { cache: 'no-store' }),
        apiFetch('/api/analitica', { cache: 'no-store' }),
        apiFetch('/api/notificaciones/clientes/estado', { cache: 'no-store' }).catch(() => null),
      ]);

      if (
        !couriersResponse.ok ||
        !routesResponse.ok ||
        !ordersResponse.ok ||
        !notificationsResponse.ok ||
        !analyticsResponse.ok
      ) {
        throw new Error('No se pudieron cargar los datos operativos.');
      }

      const couriersPayload = (await couriersResponse.json()) as {
        couriers: Courier[];
      };
      const routesPayload = (await routesResponse.json()) as {
        routes: Route[];
      };
      const ordersPayload = (await ordersResponse.json()) as {
        deliveryPoints: DeliveryPoint[];
      };
      const notificationsPayload = (await notificationsResponse.json()) as {
        notifications: Notification[];
        warning?: string;
      };
      const analyticsPayload = (await analyticsResponse.json()) as {
        metrics: FleetMetrics;
      };
      let customerNotificationStatusPayload: unknown = null;
      if (customerNotificationStatusResponse?.ok) {
        try {
          customerNotificationStatusPayload = await customerNotificationStatusResponse.json();
        } catch {
          customerNotificationStatusPayload = null;
        }
      }

      if (requestId !== dashboardRequestId.current) return;

      if (isCustomerNotificationOperationsStatus(customerNotificationStatusPayload)) {
        setCustomerNotificationOperationsStatus(customerNotificationStatusPayload);
        setCustomerNotificationOperationsUnavailable(false);
      } else {
        setCustomerNotificationOperationsUnavailable(true);
      }

      setData({
        couriers: couriersPayload.couriers,
        notifications: notificationsPayload.notifications,
        notificationsWarning: notificationsPayload.warning ?? null,
        pendingPoints: ordersPayload.deliveryPoints,
        routes: routesPayload.routes,
        metrics: analyticsPayload.metrics,
      });
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      if (requestId !== dashboardRequestId.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Error desconocido.');
    } finally {
      if (requestId === dashboardRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const availableCourierIds = data.couriers
      .filter(
        (courier) =>
          courier.status === 'AVAILABLE' &&
          courier.currentLat !== null &&
          courier.currentLng !== null &&
          isCourierLocationFresh(courier.lastLocationAt ? new Date(courier.lastLocationAt) : null)
      )
      .map((courier) => courier.id);

    setSelectedCourierIds((current) => {
      const valid = current.filter((id) => availableCourierIds.includes(id));
      return valid.length > 0 ? valid : availableCourierIds.slice(0, 1);
    });
  }, [data.couriers]);

  useEffect(() => {
    setSelectedPendingIds((current) => {
      const valid = current.filter((id) => data.pendingPoints.some((point) => point.id === id));
      return valid.length > 0 || data.pendingPoints.length === 0
        ? valid
        : data.pendingPoints.map((point) => point.id);
    });
  }, [data.pendingPoints]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const refreshInterval = window.setInterval(() => {
      void loadDashboard();
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
    setUnassignedDeliveryPointIds([]);

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
    if (assignmentPreview.length === 0) {
      setError('Primero analiza una asignación para generar la propuesta de ruta.');
      return;
    }

    setDispatching(true);
    setError(null);
    setCustomerNotificationSummary(null);

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
        customerNotifications?: unknown;
      };
      const trafficSummaries = (routePayload.routes ?? [])
        .map((route) => route.liveTraffic)
        .filter((status): status is LiveTrafficStatus => status !== undefined);
      if (trafficSummaries.length > 0) {
        setLiveTrafficNotice(summarizeLiveTraffic(trafficSummaries));
      }
      setCustomerNotificationSummary(
        isCustomerNotificationSummary(routePayload.customerNotifications)
          ? routePayload.customerNotifications
          : null
      );
      const routeAiStatus = routePayload.routes?.find(
        (route) => route.trafficAi !== undefined
      )?.trafficAi;
      if (routeAiStatus !== undefined) {
        setAssignmentAiStatus(routeAiStatus);
      }

      setAssignmentPreview([]);
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
        <div className="mx-auto max-w-[1600px] px-5 py-6 sm:px-8 lg:px-10">
          <header className="rp-page-heading flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Rutas en movimiento
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Supervisa repartidores disponibles y rutas planificadas desde una sola vista
                operativa.
              </p>
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
                className="rp-button rp-button-quiet w-full disabled:cursor-wait sm:w-auto"
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
                    Asigna su correo y una contraseña de al menos 15 caracteres. Comparte el acceso
                    por un canal privado.
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
                showTraffic
                couriers={data.couriers}
                pendingPoints={data.pendingPoints}
                routes={activeRoutes}
              />
