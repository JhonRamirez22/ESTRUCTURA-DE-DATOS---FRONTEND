'use client';

import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { isWithinPastoServiceArea, PASTO_SERVICE_BOUNDS } from '@/lib/pastoArea';
import { getPastoMapCenter } from '@/lib/mapCenter';
import { getPastoMinimumZoom } from '@/lib/mapViewport';
import TrafficOverlay from './TrafficOverlay';
import { isRoadGeometryProvider } from '@/lib/roadGeometry';
import { useT } from '@/lib/preferences';
import { changedStopIds, type LiveProposal } from '@/lib/liveOptimization';
import {
  congestionLabel,
  isSevereTraffic,
  mostCongested,
  type RouteOptimization,
} from '@/lib/routeOptimization';
import {
  isMapStyleAuthorizationError,
  KEYLESS_DARK_MAP_STYLE_URL,
} from './mapStyleFallback';

export interface MapCourier {
  id: string;
  name: string;
  currentLat: number | null;
  currentLng: number | null;
}

export interface MapDeliveryPoint {
  id: string;
  address: string;
  lat: number;
  lng: number;
  sequenceIndex: number | null;
  status?: 'PENDING' | 'EN_ROUTE' | 'DELIVERED' | 'FAILED';
}

export interface MapRoute {
  id: string;
  courier: MapCourier;
  deliveryPoints: MapDeliveryPoint[];
  geometryProvider?: 'OSRM' | 'ORS' | null;
  geometry: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  } | null;
  /** Resumen de optimización del backend: orden base, tráfico medido e IA verificada. */
  optimization?: RouteOptimization | null;
}

const DRAW_DURATION_MS = 900;
const DRAWN_KEYS = 'rutas-pasto:drawn-optimizations';

interface MapLibreRouteMapProps {
  couriers: MapCourier[];
  routes: MapRoute[];
  pendingPoints?: MapDeliveryPoint[];
  selectedCoordinate?: [number, number] | null;
  onMapClick?: (coordinate: { lat: number; lng: number }) => void;
  className?: string;
  ariaLabel?: string;
  showTraffic?: boolean;
  trafficMarks?: MapTrafficMark[];
  /** Zona del mapa tapada por la hoja o el panel: la cámara encuadra lo que queda libre. */
  inset?: MapInset;
  /** Color de cada ruta (por id); sin él todas usan el primero de la paleta. */
  routeColors?: Record<string, string>;
  /** Recálculo en vivo: ruta propuesta punteada y paradas que cambian. */
  liveProposal?: LiveProposal | null;
}

export interface MapInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const BASE_FIT_PADDING = 36;
const DEFAULT_ROUTE_COLOR = '#55f26b';
// Marching-ants frames: shifting the dash pattern makes the proposed route look like it flows.
const DASH_FRAMES: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

interface MapData {
  focusRouteId?: string | null;
  routeColors?: Record<string, string>;
  live?: LiveProposal | null;
  couriers: MapCourier[];
  pendingPoints: MapDeliveryPoint[];
  routes: MapRoute[];
  selectedCoordinate: [number, number] | null;
  trafficMarks: MapTrafficMark[];
  inset?: MapInset | undefined;
}

/** Muestras de TomTom sobre la geometría de la ruta; se pintan encima de la línea verde. */
export interface MapTrafficMark {
  coordinates: [number, number];
  trafficLevel: string;
  roadClosure: boolean;
}

type MapStatus = 'loading' | 'slow' | 'unavailable' | 'ready';

interface MapProperties {
  dim?: boolean;
  ring?: string;
  kind?: string;
  routeId?: string;
  color?: string;
  label?: string;
  route?: 'SELECTED' | 'BASELINE';
  stopId?: string;
}

type MapFeature = {
  type: 'Feature';
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'LineString'; coordinates: Array<[number, number]> };
  properties: MapProperties;
};
type MapFeatureCollection = { type: 'FeatureCollection'; features: MapFeature[] };

const PASTO_CENTER = getPastoMapCenter(
  process.env.NEXT_PUBLIC_MAP_DEFAULT_LAT,
  process.env.NEXT_PUBLIC_MAP_DEFAULT_LNG
);
const PASTO_MAP_BOUNDS: [[number, number], [number, number]] = [
  [PASTO_SERVICE_BOUNDS.minLongitude, PASTO_SERVICE_BOUNDS.minLatitude],
  [PASTO_SERVICE_BOUNDS.maxLongitude, PASTO_SERVICE_BOUNDS.maxLatitude],
];
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim();

// Fiord conserva el ambiente oscuro, pero mejora la lectura de calles y
// etiquetas frente al preset dark. OpenFreeMap no exige una API key.
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/fiord';
export default function MapLibreRouteMap({
  ariaLabel = 'Mapa de rutas',
  className = 'h-[min(68vh,680px)] min-h-[400px] w-full',
  couriers,
  onMapClick,
  pendingPoints = [],
  routes,
  selectedCoordinate = null,
  showTraffic = false,
  trafficMarks = [],
  inset,
  routeColors,
  liveProposal = null,
}: MapLibreRouteMapProps) {
  const t = useT();
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const retryMapRef = useRef<(() => void) | null>(null);
  const cameraKeyRef = useRef<string | null>(null);
  const dataRef = useRef<MapData>({ couriers, pendingPoints, routes, selectedCoordinate, trafficMarks });
