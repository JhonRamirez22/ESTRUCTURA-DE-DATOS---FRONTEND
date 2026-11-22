"use client";

import MapLibreRouteMap, {
  type MapCourier,
  type MapDeliveryPoint,
  type MapInset,
  type MapRoute,
} from "@/components/MapLibreRouteMap";
import type { LiveProposal } from "@/lib/liveOptimization";

interface RouteMapProps {
  showTraffic?: boolean;
  couriers: MapCourier[];
  routes: MapRoute[];
  pendingPoints?: MapDeliveryPoint[];
  selectedCoordinate?: [number, number] | null;
  onMapClick?: (coordinate: { lat: number; lng: number }) => void;
  className?: string;
  inset?: MapInset;
  routeColors?: Record<string, string>;
  liveProposal?: LiveProposal | null;
}

export default function RouteMap(props: RouteMapProps) {
  return <MapLibreRouteMap {...props} ariaLabel="Mapa de rutas" />;
}
