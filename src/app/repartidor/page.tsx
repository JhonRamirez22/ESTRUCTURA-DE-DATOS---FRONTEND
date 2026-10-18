"use client";

import { apiFetch } from "@/lib/apiClient";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import AppShell from "@/components/AppShell";
import { isCourierLocationFresh } from "@/lib/courierLocation";

const CourierRouteMap = dynamic(() => import("./CourierRouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[340px] items-center justify-center bg-slate-100 text-sm text-slate-500">
      Cargando mapa de tu ruta…
    </div>
  ),
});

const MIN_UPDATE_INTERVAL_MS = 5_000;
const NAVIGATION_REFRESH_INTERVAL_MS = 15_000;

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

interface CourierProfile {
  status: "AVAILABLE" | "ON_ROUTE" | "OFFLINE";
  currentLat: number | null;
  currentLng: number | null;
  lastLocationAt: string | null;
}

export default function RepartidorPage() {
  const [courierStatus, setCourierStatus] = useState<CourierProfile["status"]>("OFFLINE");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [lastLocation, setLastLocation] = useState<LastLocation | null>(null);
  const [sentEvents, setSentEvents] = useState(0);
  const [assignedRoute, setAssignedRoute] = useState<AssignedRoute | null>(null);
  const [navigation, setNavigation] = useState<NavigationSnapshot | null>(null);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSentAt = useRef(0);
  const activeDeliveryPoints =
    assignedRoute?.deliveryPoints.filter(
      (point) => point.status === "PENDING" || point.status === "EN_ROUTE",
    ) ?? [];

  const loadCourierProfile = useCallback(async (): Promise<void> => {
    setLoadingProfile(true);

    try {
      const response = await apiFetch("/api/repartidores/me", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo validar tu sesión."));
      }

      const payload = (await response.json()) as { courier: CourierProfile };
      setCourierStatus(payload.courier.status);
      setLastLocation(
        payload.courier.currentLat !== null &&
          payload.courier.currentLng !== null &&
          payload.courier.lastLocationAt
          ? {
              lat: payload.courier.currentLat,
              lng: payload.courier.currentLng,
              recordedAt: payload.courier.lastLocationAt,
            }
          : null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo validar tu sesión.",
      );
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  const refreshNavigation = useCallback(async (routeId: string): Promise<void> => {
    const response = await apiFetch(`/api/rutas/${encodeURIComponent(routeId)}/navegacion`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(await readApiError(response, "No se pudo actualizar la navegación."));
    }

    const payload = (await response.json()) as {
      navigation: NavigationSnapshot | null;
    };
    setNavigation(payload.navigation);
    setNavigationError(null);

    if (payload.navigation) {
      setAssignedRoute((currentRoute) =>
        currentRoute?.id === routeId
          ? {
              ...currentRoute,
              geometry: payload.navigation!.geometry,
              geometryProvider: payload.navigation!.geometryProvider,
            }
          : currentRoute,
      );
    }
  }, []);

  const loadAssignedRoute = useCallback(async (): Promise<void> => {
    try {
      const response = await apiFetch("/api/rutas", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo cargar la ruta asignada."));
      }

      const payload = (await response.json()) as { routes: AssignedRoute[] };
      const route = payload.routes.find(
        (candidate) =>
          candidate.status === "PLANNED" || candidate.status === "IN_PROGRESS",
      ) ?? null;

      setAssignedRoute(route);
      setNavigation(null);

      if (route) {
        void refreshNavigation(route.id).catch((navigationError) => {
          setNavigationError(
            navigationError instanceof Error
              ? navigationError.message
              : "No se pudo actualizar la ruta vial; se conserva solo la geometría vial guardada.",
          );
        });
      } else {
        setNavigationError(null);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo cargar la ruta asignada. Recupera la conexión e inténtalo de nuevo.",
      );
    }
  }, [refreshNavigation]);

  useEffect(() => {
    // Retira identificadores y rutas privadas almacenados por versiones antiguas de la PWA.
    window.localStorage.removeItem("rutas-pasto:courier-id");
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("rutas-pasto:assigned-route:")) {
        window.localStorage.removeItem(key);
      }
    }
    void loadCourierProfile();
    void loadAssignedRoute();

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [loadAssignedRoute, loadCourierProfile]);

  useEffect(() => {
    const handleOnline = () => {
      void loadCourierProfile();
      void loadAssignedRoute();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [loadAssignedRoute, loadCourierProfile]);

  useEffect(() => {
    if (!lastLocation) {
      return;
    }

    const expireStalePosition = () => {
      if (!isCourierLocationFresh(new Date(lastLocation.recordedAt))) {
        setLastLocation(null);
      }
    };
    const interval = window.setInterval(expireStalePosition, 15_000);
    return () => window.clearInterval(interval);
  }, [lastLocation]);

  useEffect(() => {
    const routeId = assignedRoute?.id;
    const shouldRefresh =
      routeId !== undefined &&
      (assignedRoute?.status === "IN_PROGRESS" || isTracking);

    if (!shouldRefresh || routeId === undefined) {
      return;
    }

    const refresh = () => {
      void refreshNavigation(routeId).catch(() => {
        // La última geometría válida permanece visible durante un fallo puntual.
      });
    };
    const interval = window.setInterval(refresh, NAVIGATION_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [assignedRoute?.id, assignedRoute?.status, isTracking, refreshNavigation]);

  const stopTracking = async () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
    try {
      const response = await apiFetch("/api/repartidores/me/ubicacion", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo actualizar el estado."));
      }
      const payload = (await response.json()) as { courier: { status: CourierProfile["status"] } };
      setCourierStatus(payload.courier.status);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "El GPS se detuvo en el dispositivo, pero no se confirmó con el servidor.");
    }
  };

  const updateRouteStatus = async (status: "IN_PROGRESS" | "COMPLETED") => {
    if (!assignedRoute) {
      return;
    }

    try {
      const response = await apiFetch(`/api/rutas/${encodeURIComponent(assignedRoute.id)}`, {
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo actualizar la ruta."));
      }

      setError(null);
      await loadAssignedRoute();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar la ruta.");
    }
  };

  const updateDeliveryStatus = async (
    deliveryPointId: string,
    status: "DELIVERED" | "FAILED",
  ) => {
    try {
      const response = await apiFetch(`/api/pedidos/${encodeURIComponent(deliveryPointId)}`, {
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo actualizar la entrega."));
      }

      setError(null);
      await loadAssignedRoute();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar la entrega.");
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError("Este dispositivo no permite obtener la ubicación.");
      return;
    }

    setError(null);
    void loadAssignedRoute();
    setSentEvents(0);
    lastSentAt.current = 0;

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const recordedAt = new Date(position.timestamp).toISOString();
        const now = Date.now();

        if (now - lastSentAt.current < MIN_UPDATE_INTERVAL_MS) {
          return;
        }

        lastSentAt.current = now;
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          recordedAt,
        };

        void sendLocation(location).then((result) => {
          if (result.accepted) {
            setLastLocation(location);
            setCourierStatus(assignedRoute ? "ON_ROUTE" : "AVAILABLE");
            setSentEvents((current) => current + 1);
            setError(null);
          } else if (result.error) {
            setError(result.error);
          }
        });
      },
      (positionError) => {
        setError(formatGeolocationError(positionError));
      },
