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
