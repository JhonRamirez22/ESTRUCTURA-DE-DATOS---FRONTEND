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
        .setText(t('opt.legMinutes', { min: leg.minutes.toLocaleString('es-CO') }))
        .addTo(map);
    };
    const hide = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    };
    map.on('mousemove', 'route-stops', show);
    map.on('mouseleave', 'route-stops', hide);
    return () => {
      map.off('mousemove', 'route-stops', show);
      map.off('mouseleave', 'route-stops', hide);
      popup.remove();
    };
  }, [t]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !onMapClick) {
      return;
    }

    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      if (!isWithinPastoServiceArea(event.lngLat.lat, event.lngLat.lng)) {
        return;
      }
      onMapClick({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [onMapClick]);

  return (
    <div
      aria-label={ariaLabel}
      className={`relative isolate overflow-hidden bg-[#17242b] ${className}`}
      role="region"
      style={
        inset
          ? ({ '--map-inset-left': `${inset.left}px`, '--map-inset-bottom': `${inset.bottom}px` } as CSSProperties)
          : undefined
      }
    >
      <div
        ref={containerRef}
        className="absolute inset-0 h-full w-full"
        style={{ height: '100%', width: '100%' }}
      />
      {showTraffic && mapStatus === 'ready' && selectedRoute ? (
        <TrafficOverlay key={selectedRoute.id} routeId={selectedRoute.id} />
      ) : null}
      {routes.length > 1 && selectedRoute ? (
        <select
          aria-label="Recorrido resaltado"
          className="rp-button rp-button-map absolute right-3 top-3 z-10 max-w-[45%] text-xs"
          value={selectedRouteId ?? ''}
          onChange={(event) => setSelectedRouteId(event.target.value || null)}
        >
          <option value="">Todas las rutas</option>
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.courier.name} · {route.deliveryPoints.length} paradas
            </option>
          ))}
        </select>
      ) : null}
      {selectedRoute?.optimization && mapStatus === 'ready' ? (
        <OptimizationBadge optimization={selectedRoute.optimization} />
      ) : null}
      <button
        className="rp-button rp-button-map rp-map-center absolute left-3 top-3 z-10"
        data-tip="tip.centerMap"
        onClick={() => {
          const map = mapRef.current;
          if (!map?.isStyleLoaded()) return;
          cameraKeyRef.current = null;
          updateMapData(map, dataRef.current, cameraKeyRef);
        }}
        type="button"
      >
        {t('map.center')}
      </button>
      {mapStatus !== 'ready' ? (
        <div
          aria-label="Carga del mapa"
          aria-live="polite"
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[#0b1518]/35 px-4 text-center backdrop-blur-[2px]"
          role="status"
        >
          <div className="max-w-sm rounded-2xl border border-white/15 bg-[#142422]/95 px-5 py-4 text-white shadow-[0_14px_36px_rgba(0,0,0,0.32)]">
            <div className="flex items-center justify-center gap-3">
              {mapStatus !== 'unavailable' ? (
                <span
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-emerald-100/35 border-t-emerald-300 motion-reduce:animate-none"
                />
              ) : null}
              <p className="text-sm font-semibold text-emerald-50">
                {mapStatus === 'loading'
                  ? 'Cargando calles de Pasto…'
                  : mapStatus === 'slow'
                    ? 'El mapa está tardando en responder…'
                    : 'No se pudieron cargar las calles.'}
              </p>
            </div>
            {mapStatus === 'unavailable' ? (
              <>
                <p className="mt-2 text-xs leading-5 text-white/75">
                  Revisa tu conexión e inténtalo de nuevo.
                </p>
                <button
                  className="rp-button rp-button-secondary rp-button-small pointer-events-auto mt-3"
                  onClick={() => retryMapRef.current?.()}
                  type="button"
                >
                  Reintentar mapa
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function addMapLayers(map: MapLibreMap): void {
  if (!map.getSource('route-baseline')) {
    // El orden sin optimizar, discontinuo y bajo la línea verde: muestra qué cambió.
    map.addSource('route-baseline', { type: 'geojson', data: emptyFeatureCollection() });
    map.addLayer({
      id: 'route-baseline',
      type: 'line',
      source: 'route-baseline',
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': '#e7c9a9',
        'line-opacity': 0.8,
        'line-width': 3.5,
        'line-dasharray': [1.4, 1.6],
      },
    });
  }
  if (!map.getSource('delivery-directions')) {
    map.addSource('delivery-directions', {
      type: 'geojson',
      data: emptyFeatureCollection(),
    });

    // Un único recorrido verde; el borde oscuro solo mejora su lectura sobre las calles.
    map.addLayer({
      id: 'delivery-route-highlight-casing',
      type: 'line',
      source: 'delivery-directions',
      filter: ['==', ['get', 'route'], 'SELECTED'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#06130b',
        'line-opacity': ['case', ['get', 'dim'], 0.35, 0.95],
        'line-width': 9,
      },
    });
    map.addLayer({
      id: 'delivery-route-highlight',
      type: 'line',
      source: 'delivery-directions',
      filter: ['==', ['get', 'route'], 'SELECTED'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], DEFAULT_ROUTE_COLOR],
        'line-opacity': ['case', ['get', 'dim'], 0.35, 1],
        'line-width': 5,
        'line-blur': 0.15,
      },
    });
    ensureArrowImage(map);
    map.addLayer({
      id: 'delivery-route-arrows',
      type: 'symbol',
      source: 'delivery-directions',
      filter: ['==', ['get', 'route'], 'SELECTED'],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 72,
        'icon-image': 'route-arrow',
        'icon-size': 0.5,
        'icon-allow-overlap': true,
        'icon-rotation-alignment': 'map',
      },
      paint: { 'icon-color': '#06130b', 'icon-opacity': ['case', ['get', 'dim'], 0.25, 0.85] },
    });
  }

  if (!map.getSource('live-proposal')) {
    // Recálculo en vivo: la ruta propuesta, punteada y animada, sobre la actual.
    map.addSource('live-proposal', { type: 'geojson', data: emptyFeatureCollection() });
    map.addLayer({
      id: 'live-proposal-casing',
      type: 'line',
      source: 'live-proposal',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      // El desplazamiento la dibuja junto a la ruta actual, como una gemela punteada.
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.4, 'line-width': 8, 'line-offset': 6 },
    });
    map.addLayer({
      id: 'live-proposal',
      type: 'line',
      source: 'live-proposal',
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#ffffff'],
        'line-width': 4,
        'line-offset': 6,
        'line-dasharray': [2, 2],
      },
    });
  }
  if (!map.getSource('live-stops')) {
    map.addSource('live-stops', { type: 'geojson', data: emptyFeatureCollection() });
    map.addLayer({
      id: 'live-stops-halo',
      type: 'circle',
      source: 'live-stops',
      paint: {
        'circle-color': ['coalesce', ['get', 'color'], '#ffffff'],
        'circle-opacity': 0.4,
        'circle-radius': 18,
        'circle-blur': 0.6,
      },
    });
    map.addLayer({
      id: 'live-stops',
      type: 'circle',
      source: 'live-stops',
      paint: {
        'circle-color': '#ffffff',
        'circle-opacity': 0.18,
        'circle-radius': 14,
        'circle-stroke-color': ['coalesce', ['get', 'color'], '#ffffff'],
        'circle-stroke-width': ['case', ['==', ['get', 'kind'], 'moved'], 4, 2.5],
      },
    });
  }

  if (!map.getSource('delivery-labels')) {
    map.addSource('delivery-labels', {
      type: 'geojson',
      data: emptyFeatureCollection(),
    });
    map.addLayer({
      id: 'delivery-labels',
      type: 'symbol',
      minzoom: 14,
      source: 'delivery-labels',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-offset': [0, 1.5],
        'text-anchor': 'top',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#f8fafc',
        'text-halo-color': '#111827',
        'text-halo-width': 2,
      },
    });
  }

  if (!map.getSource('courier-points')) {
    map.addSource('courier-points', {
      type: 'geojson',
      data: emptyFeatureCollection(),
      cluster: true,
      clusterRadius: 36,
      clusterMaxZoom: 13,
    });
    map.addLayer({
      id: 'courier-points',
      type: 'circle',
      source: 'courier-points',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#06b6d4',
        'circle-radius': 10,
        'circle-stroke-color': '#ecfeff',
        'circle-stroke-width': 3,
      },
    });
    map.addLayer({
      id: 'courier-labels',
      type: 'symbol',
      minzoom: 14,
      source: 'courier-points',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-offset': [0, 1.6],
        'text-anchor': 'top',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#ecfeff',
        'text-halo-color': '#0f172a',
        'text-halo-width': 2,
      },
    });
    addClusters(map, 'courier-points');
  }

  if (!map.getSource('route-stops')) {
    // Paradas de una ruta: nunca se agrupan, para que se lea el número y el color de cada una.
    map.addSource('route-stops', { type: 'geojson', data: emptyFeatureCollection() });
    map.addLayer({
      id: 'route-stops',
      type: 'circle',
      source: 'route-stops',
      paint: {
        'circle-color': ['coalesce', ['get', 'color'], '#a855f7'],
        'circle-radius': 10,
        'circle-stroke-color': ['coalesce', ['get', 'ring'], '#06130b'],
        'circle-stroke-width': 3,
        'circle-opacity': ['case', ['get', 'dim'], 0.45, 1],
        'circle-stroke-opacity': ['case', ['get', 'dim'], 0.45, 1],
      },
    });
    map.addLayer({
      id: 'route-stop-numbers',
      type: 'symbol',
      source: 'route-stops',
      layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-allow-overlap': true },
      paint: { 'text-color': '#06130b' },
    });
  }

  if (!map.getSource('delivery-points')) {
    map.addSource('delivery-points', {
      type: 'geojson',
      data: emptyFeatureCollection(),
      cluster: true,
      clusterRadius: 36,
      clusterMaxZoom: 13,
    });
    map.addLayer({
      id: 'delivery-points',
      type: 'circle',
      source: 'delivery-points',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['coalesce', ['get', 'color'], '#a855f7'],
        'circle-radius': 8,
        'circle-stroke-color': ['coalesce', ['get', 'ring'], '#f5d0fe'],
        'circle-stroke-width': 3,
        'circle-opacity': ['case', ['get', 'dim'], 0.45, 1],
        'circle-stroke-opacity': ['case', ['get', 'dim'], 0.45, 1],
      },
    });
    addClusters(map, 'delivery-points');
  }
}

/** Triangle used as a direction arrow; SDF so each route can tint it. */
function ensureArrowImage(map: MapLibreMap): void {
  if (typeof map.hasImage !== 'function' || typeof map.addImage !== 'function') return;
  if (map.hasImage('route-arrow')) return;
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.moveTo(size * 0.82, size / 2);
  context.lineTo(size * 0.22, size * 0.2);
  context.lineTo(size * 0.38, size / 2);
  context.lineTo(size * 0.22, size * 0.8);
  context.closePath();
  context.fill();
  map.addImage('route-arrow', context.getImageData(0, 0, size, size), { sdf: true });
}

function stopRingColor(status: MapDeliveryPoint['status']): string {
  if (status === 'DELIVERED') return '#22c55e';
  if (status === 'FAILED') return '#f43f5e';
  return '#06130b';
}

/** Draws the live proposal: dashed new routes plus the stops that move or change order. */
function updateLiveLayers(map: MapLibreMap, data: MapData): void {
  const lines: MapFeature[] = [];
  const stops: MapFeature[] = [];
  const live = data.live;
  if (live?.changed) {
    const colorOf = (routeId: string) => data.routeColors?.[routeId] ?? DEFAULT_ROUTE_COLOR;
    const where = new Map<string, [number, number]>();
    for (const route of data.routes) {
      for (const point of route.deliveryPoints) where.set(point.id, [point.lng, point.lat]);
    }
    for (const item of live.routes) {
      const coordinates = item.geometry?.coordinates;
      if (!item.changed || !coordinates || coordinates.length < 2) continue;
      if (!coordinates.every(([lng, lat]) => isWithinPastoServiceArea(lat, lng))) continue;
      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { color: colorOf(item.routeId), routeId: item.routeId },
      });
    }
    const moved = new Set<string>();
    for (const move of live.moves) {
      const at = where.get(move.stopId);
      if (!at) continue;
      moved.add(move.stopId);
      const feature = pointFeature(at, colorOf(move.toRouteId), 'moved');
      feature.properties.kind = 'moved';
      stops.push(feature);
    }
    for (const stopId of changedStopIds(live)) {
      const at = where.get(stopId);
      if (!at || moved.has(stopId)) continue;
      const owner = live.routes.find((item) => item.proposedOrder.includes(stopId));
      const feature = pointFeature(at, colorOf(owner?.routeId ?? ''), 'reordered');
      feature.properties.kind = 'reordered';
      stops.push(feature);
    }
  }
  (map.getSource('live-proposal') as GeoJSONSource | undefined)?.setData(featureCollection(lines));
  (map.getSource('live-stops') as GeoJSONSource | undefined)?.setData(featureCollection(stops));
}

function addClusters(map: MapLibreMap, source: string): void {
  map.addLayer({
    id: `${source}-clusters`,
    type: 'circle',
    source,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#6B4F3F',
      'circle-radius': 17,
      'circle-stroke-color': '#FFFCF7',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: `${source}-cluster-count`,
    type: 'symbol',
    source,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 12,
    },
    paint: { 'text-color': '#FFFCF7' },
  });
}

// Rojo apagado: solo el tráfico grave aparece; la ruta verde sigue siendo lo principal.
function trafficColor(level: string, roadClosure: boolean): string {
  if (roadClosure || level === 'CERRADO') return '#7f1d1d';
  return level === 'MUY_ALTO' ? '#b91c1c' : '#c2410c';
}

function updateMapData(
  map: MapLibreMap,
  data: MapData,
  cameraKey: { current: string | null }
): void {
  const directionFeatures: MapFeature[] = [];
  const labelFeatures: MapFeature[] = [];
  const courierFeatures: MapFeature[] = [];
  const deliveryFeatures: MapFeature[] = [];
  const routeStopFeatures: MapFeature[] = [];
  const focusCoordinates: Array<[number, number]> = [];

  for (const courier of data.couriers) {
    if (
      courier.currentLat === null ||
      courier.currentLng === null ||
      !isWithinPastoServiceArea(courier.currentLat, courier.currentLng)
    ) {
      continue;
    }

    const coordinate: [number, number] = [courier.currentLng, courier.currentLat];
    if (data.routes.length === 0 || data.routes.some((item) => item.courier.id === courier.id))
      focusCoordinates.push(coordinate);
    const ownRoute = data.routes.find((item) => item.courier.id === courier.id);
    const courierColor = ownRoute ? (data.routeColors?.[ownRoute.id] ?? DEFAULT_ROUTE_COLOR) : '#06b6d4';
    courierFeatures.push(pointFeature(coordinate, courierColor, courier.name));
    labelFeatures.push(pointFeature(coordinate, courierColor, courier.name));
  }

