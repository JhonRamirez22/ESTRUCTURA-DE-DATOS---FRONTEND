"use client";

import MapLibreRouteMap, {
  type MapCourier,
  type MapDeliveryPoint,
  type MapInset,
  type MapRoute,
} from "@/components/MapLibreRouteMap";

interface RouteMapProps {
  showTraffic?: boolean;
  couriers: MapCourier[];
  routes: MapRoute[];
  pendingPoints?: MapDeliveryPoint[];
  selectedCoordinate?: [number, number] | null;
  onMapClick?: (coordinate: { lat: number; lng: number }) => void;
  className?: string;
  inset?: MapInset;
}

export default function RouteMap(props: RouteMapProps) {
  return <MapLibreRouteMap {...props} ariaLabel="Mapa de rutas" />;
}
