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
