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
