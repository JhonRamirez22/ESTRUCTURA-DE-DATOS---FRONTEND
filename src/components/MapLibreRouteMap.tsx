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
  dataRef.current = {
    couriers, pendingPoints, routes, selectedCoordinate, trafficMarks, inset,
    focusRouteId: selectedRouteId, routeColors, live: liveProposal,
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    // Next debe emitir el worker como asset; import.meta.url del bundle apunta a la ruta de la página.
    maplibregl.setWorkerUrl(
      new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString(),
    );

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL || DEFAULT_STYLE_URL,
      center: PASTO_CENTER,
      zoom: 13,
      maxBounds: PASTO_MAP_BOUNDS,
      minZoom: getPastoMinimumZoom(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight
      ),
      maxZoom: 18,
      renderWorldCopies: false,
      refreshExpiredTiles: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;
    let fallbackApplied = false;
    let fallbackTimer = 0;
    let slowTimer = 0;
    let unavailableTimer = 0;
    const armLoadingTimers = () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(unavailableTimer);
      slowTimer = window.setTimeout(() => setMapStatus('slow'), 7000);
      unavailableTimer = window.setTimeout(() => setMapStatus('unavailable'), 20000);
    };
    armLoadingTimers();
    let styleInitialized = false;
    const markMapReady = () => {
      if (!styleInitialized) return;
      window.clearTimeout(slowTimer);
      window.clearTimeout(unavailableTimer);
      setMapStatus('ready');
    };
    const renderData = () => {
      // style.load permite añadir capas aunque las teselas sigan pendientes.
      styleInitialized = true;
      map.once('render', markMapReady);
      addMapLayers(map);
      updateMapData(map, dataRef.current, cameraKeyRef);
    };
    const restoreData = () => {
      if (map.isStyleLoaded()) renderData();
    };
    const applyFallbackStyle = () => {
      if (fallbackApplied) {
        return;
      }

      fallbackApplied = true;
      window.clearTimeout(fallbackTimer);
      if (styleInitialized) {
        setMapStatus('loading');
        armLoadingTimers();
      }
      styleInitialized = false;
      map.setStyle(KEYLESS_DARK_MAP_STYLE_URL);
    };
    retryMapRef.current = () => {
      window.clearTimeout(fallbackTimer);
      setMapStatus('loading');
      styleInitialized = false;
      armLoadingTimers();
      fallbackApplied = false;
      map.setStyle(MAP_STYLE_URL || DEFAULT_STYLE_URL);
      fallbackTimer = window.setTimeout(() => {
        if (!map.isStyleLoaded() && !fallbackApplied) {
          applyFallbackStyle();
        }
      }, 5000);
    };
    const handleMapError = (event: unknown) => {
      if (isMapStyleAuthorizationError(event)) {
        applyFallbackStyle();
      }
    };
    map.on('error', handleMapError);
    map.on('idle', markMapReady);
    fallbackTimer = window.setTimeout(() => {
      if (!map.isStyleLoaded() && !fallbackApplied) {
        applyFallbackStyle();
      }
    }, 5000);

    map.on('style.load', renderData);
    if (map.isStyleLoaded()) renderData();
    map.on('webglcontextrestored', restoreData);
    const resizeTimer = window.setTimeout(() => map.resize(), 0);
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      if (containerRef.current)
        map.setMinZoom(
          getPastoMinimumZoom(containerRef.current.clientWidth, containerRef.current.clientHeight)
        );
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      window.clearTimeout(resizeTimer);
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(slowTimer);
      window.clearTimeout(unavailableTimer);
      resizeObserver.disconnect();
      map.off('error', handleMapError);
      map.off('idle', markMapReady);
      map.off('style.load', renderData);
      map.off('webglcontextrestored', restoreData);
      map.remove();
      mapRef.current = null;
      retryMapRef.current = null;
      cameraKeyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !map.isStyleLoaded()) {
      return;
    }

    updateMapData(map, dataRef.current, cameraKeyRef);
  }, [couriers, pendingPoints, routes, selectedCoordinate, selectedRouteId, trafficMarks, routeColors, liveProposal, inset?.top, inset?.right, inset?.bottom, inset?.left]);

  // Una optimización nueva se dibuja de la salida a la última parada (una vez por sesión).
  const drawKey = selectedRoute?.optimization?.computedAt
    ? `${selectedRoute.id}:${selectedRoute.optimization.computedAt}`
    : null;
  useEffect(() => {
    const map = mapRef.current;
    const coordinates = selectedRoute?.geometry?.coordinates;
    if (!map || !drawKey || !coordinates || coordinates.length < 2 || mapStatus !== 'ready') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let drawn: string[] = [];
    try {
      drawn = JSON.parse(window.sessionStorage.getItem(DRAWN_KEYS) ?? '[]') as string[];
    } catch {
      drawn = [];
    }
    if (drawn.includes(drawKey)) return;
    try {
      window.sessionStorage.setItem(DRAWN_KEYS, JSON.stringify([...drawn.slice(-20), drawKey]));
    } catch {
      // Sin almacenamiento se vuelve a dibujar en la próxima visita; no afecta los datos.
    }
    const source = map.getSource('delivery-directions') as GeoJSONSource | undefined;
    if (!source) return;
    let frame = 0;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / DRAW_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      const visible = coordinates.slice(0, Math.max(2, Math.ceil(eased * coordinates.length)));
      const current = dataRef.current;
      const features: MapFeature[] = [];
      for (const route of current.routes) {
        const full = route.geometry?.coordinates;
        if (!full || full.length < 2 || !isRoadGeometryProvider(route.geometryProvider)) continue;
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: route.id === selectedRoute?.id ? visible : full },
          properties: {
            route: 'SELECTED',
            color: current.routeColors?.[route.id] ?? DEFAULT_ROUTE_COLOR,
            dim: Boolean(current.focusRouteId) && current.focusRouteId !== route.id,
            routeId: route.id,
          },
        });
      }
      source.setData(featureCollection(features));
      if (progress < 1) frame = requestAnimationFrame(step);
      else updateMapData(map, dataRef.current, cameraKeyRef);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [drawKey, mapStatus, selectedRoute?.id, selectedRoute?.geometry?.coordinates]);

  // Recálculo en vivo: la ruta propuesta «fluye» y las paradas afectadas laten.
  const liveActive = Boolean(liveProposal?.changed);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mapStatus !== 'ready' || !liveActive) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let last = 0;
    const started = performance.now();
    const step = (now: number) => {
      if (now - last >= 70) {
        last = now;
        const seconds = (now - started) / 1000;
        if (map.getLayer('live-proposal')) {
          map.setPaintProperty(
            'live-proposal',
            'line-dasharray',
            DASH_FRAMES[Math.floor(seconds * 12) % DASH_FRAMES.length]
          );
        }
        if (map.getLayer('live-stops-halo')) {
          const phase = (seconds % 1.6) / 1.6;
          map.setPaintProperty('live-stops-halo', 'circle-radius', 12 + 14 * phase);
          map.setPaintProperty('live-stops-halo', 'circle-opacity', 0.5 * (1 - phase));
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [liveActive, mapStatus]);

  // Al pasar el puntero sobre una parada: minutos del tramo que llega a ella desde la anterior.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 14,
      className: 'rl-leg-popup',
    });
    const show = (event: maplibregl.MapLayerMouseEvent) => {
      const stopId = event.features?.[0]?.properties?.stopId as string | undefined;
      const hoveredRoute = event.features?.[0]?.properties?.routeId as string | undefined;
      const optimization = (
        dataRef.current.routes.find((item) => item.id === hoveredRoute) ?? dataRef.current.routes[0]
      )?.optimization;
      const leg = stopId ? optimization?.legs.find((item) => item.toStop === stopId) : undefined;
      if (!leg || leg.minutes === null) {
        popup.remove();
        return;
      }
      map.getCanvas().style.cursor = 'pointer';
      popup
        .setLngLat(event.lngLat)
