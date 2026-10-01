"use client";

import MapLibreRouteMap, {
  type MapCourier,
  type MapInset,
  type MapRoute,
  type MapTrafficMark,
} from "@/components/MapLibreRouteMap";

export interface CourierRouteMapData {
  id: string;
  courier: {
    currentLat: number | null;
    currentLng: number | null;
  };
  deliveryPoints: Array<{
    id: string;
    address: string;
    lat: number;
    lng: number;
    sequenceIndex: number | null;
    status: "PENDING" | "EN_ROUTE" | "DELIVERED" | "FAILED";
  }>;
  geometryProvider: "OSRM" | "ORS" | null;
  geometry: {
    type: "LineString";
    coordinates: Array<[number, number]>;
  } | null;
}

interface CurrentLocation {
  lat: number;
  lng: number;
}

interface CourierRouteMapProps {
  currentLocation: CurrentLocation | null;
  route: CourierRouteMapData;
  trafficMarks?: MapTrafficMark[];
  className?: string;
  inset?: MapInset;
}

export default function CourierRouteMap({
  currentLocation,
  route,
  trafficMarks = [],
  className = "h-[340px] w-full",
  inset,
}: CourierRouteMapProps) {
  const courier: MapCourier = {
