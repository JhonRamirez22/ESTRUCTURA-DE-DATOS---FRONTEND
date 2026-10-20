'use client';

import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { isWithinPastoServiceArea, PASTO_SERVICE_BOUNDS } from '@/lib/pastoArea';
import { getPastoMapCenter } from '@/lib/mapCenter';
import { getPastoMinimumZoom } from '@/lib/mapViewport';
import TrafficOverlay from './TrafficOverlay';
import { isRoadGeometryProvider } from '@/lib/roadGeometry';
import { useT } from '@/lib/preferences';
import { congestionLabel, mostCongested, type RouteOptimization } from '@/lib/routeOptimization';
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
}

/** Muestras de TomTom sobre la geometría de la ruta; se pintan encima de la línea verde. */
export interface MapTrafficMark {
  coordinates: [number, number];
  trafficLevel: string;
  roadClosure: boolean;
}

type MapStatus = 'loading' | 'slow' | 'unavailable' | 'ready';

interface MapProperties {
  color?: string;
  label?: string;
  route?: 'SELECTED' | 'BASELINE';
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
}: MapLibreRouteMapProps) {
  const t = useT();
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0] ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const retryMapRef = useRef<(() => void) | null>(null);
  const cameraKeyRef = useRef<string | null>(null);
  const dataRef = useRef({ couriers, pendingPoints, routes, selectedCoordinate, trafficMarks });
  dataRef.current = {
    couriers, pendingPoints, routes: selectedRoute ? [selectedRoute] : [], selectedCoordinate, trafficMarks,
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
  }, [couriers, pendingPoints, routes, selectedCoordinate, selectedRouteId, trafficMarks]);

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
      source.setData(
        featureCollection([
          { type: 'Feature', geometry: { type: 'LineString', coordinates: visible }, properties: { route: 'SELECTED' } },
        ])
      );
      if (progress < 1) frame = requestAnimationFrame(step);
      else updateMapData(map, dataRef.current, cameraKeyRef);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [drawKey, mapStatus, selectedRoute?.geometry?.coordinates]);

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
          aria-label="Recorrido mostrado"
          className="rp-button rp-button-map absolute right-3 top-3 z-10 max-w-[45%] text-xs"
          value={selectedRoute.id}
          onChange={(event) => setSelectedRouteId(event.target.value)}
        >
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
        className="rp-button rp-button-map absolute left-3 top-3 z-10"
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
        'line-opacity': 0.95,
        'line-width': 10,
      },
    });
    map.addLayer({
      id: 'delivery-route-highlight',
      type: 'line',
      source: 'delivery-directions',
      filter: ['==', ['get', 'route'], 'SELECTED'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#55f26b',
        'line-opacity': 1,
        'line-width': 5.5,
        'line-blur': 0.15,
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
        'circle-stroke-color': '#f5d0fe',
        'circle-stroke-width': 3,
      },
    });
    addClusters(map, 'delivery-points');
  }
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

function trafficColor(level: string, roadClosure: boolean): string {
  if (roadClosure || level === 'CERRADO') return '#7f1d1d';
  switch (level) {
    case 'MUY_ALTO': return '#dc2626';
    case 'ALTO': return '#ea580c';
    case 'MODERADO': return '#f59e0b';
    case 'FLUIDO': return '#0d9488';
    default: return '#94a3b8';
  }
}

function updateMapData(
  map: MapLibreMap,
  data: {
    couriers: MapCourier[];
    pendingPoints: MapDeliveryPoint[];
    routes: MapRoute[];
    selectedCoordinate: [number, number] | null;
    trafficMarks: MapTrafficMark[];
  },
  cameraKey: { current: string | null }
): void {
  const directionFeatures: MapFeature[] = [];
  const labelFeatures: MapFeature[] = [];
  const courierFeatures: MapFeature[] = [];
  const deliveryFeatures: MapFeature[] = [];
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
    if (data.routes.length === 0 || data.routes[0]?.courier.id === courier.id)
      focusCoordinates.push(coordinate);
    courierFeatures.push(pointFeature(coordinate, '#06b6d4', courier.name));
    labelFeatures.push(pointFeature(coordinate, '#06b6d4', courier.name));
  }

  for (const route of data.routes) {
    const currentCourier =
      data.couriers.find((courier) => courier.id === route.courier.id) ?? route.courier;

    if (
      currentCourier.currentLat !== null &&
      currentCourier.currentLng !== null &&
      isWithinPastoServiceArea(currentCourier.currentLat, currentCourier.currentLng)
    ) {
      focusCoordinates.push([currentCourier.currentLng, currentCourier.currentLat]);
    }
    // No dibujamos datos históricos fuera de Pasto: evita que un registro
    // antiguo con coordenadas 0,0 cambie el encuadre hacia otro país.
    const validRoutePoints = route.deliveryPoints.filter((point) =>
      isWithinPastoServiceArea(point.lat, point.lng)
    );
    const geometryCoordinates = route.geometry?.coordinates;
    const hasValidGeometry =
      isRoadGeometryProvider(route.geometryProvider) &&
      geometryCoordinates !== undefined &&
      geometryCoordinates.length > 1 &&
      geometryCoordinates.every(([lng, lat]) => isWithinPastoServiceArea(lat, lng));
    // Sin geometría vial de OSRM no dibujamos conexiones rectas que aparenten
    // ser calles: los marcadores siguen visibles y la navegación puede reintentarse.
    if (hasValidGeometry && geometryCoordinates) {
      focusCoordinates.push(...geometryCoordinates);
      directionFeatures.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: geometryCoordinates },
        properties: {
          route: 'SELECTED',
        },
      });
    }

    for (const [index, point] of validRoutePoints.entries()) {
      const coordinate: [number, number] = [point.lng, point.lat];
      focusCoordinates.push(coordinate);
      const label = `${(point.sequenceIndex ?? index) + 1}`;
      const color = deliveryPointColor(point.status);
      deliveryFeatures.push(pointFeature(coordinate, color, label));
      labelFeatures.push(pointFeature(coordinate, color, label));
    }
  }

  for (const point of data.pendingPoints) {
    if (!isWithinPastoServiceArea(point.lat, point.lng)) {
      continue;
    }
    const coordinate: [number, number] = [point.lng, point.lat];
    if (data.routes.length === 0) focusCoordinates.push(coordinate);
    deliveryFeatures.push(pointFeature(coordinate, '#f59e0b', 'Pendiente'));
    labelFeatures.push(pointFeature(coordinate, '#f59e0b', 'Pendiente'));
  }

  if (
    data.selectedCoordinate &&
    isWithinPastoServiceArea(data.selectedCoordinate[0], data.selectedCoordinate[1])
  ) {
    const coordinate: [number, number] = [data.selectedCoordinate[1], data.selectedCoordinate[0]];
    focusCoordinates.push(coordinate);
    deliveryFeatures.push(pointFeature(coordinate, '#facc15', 'Nueva ubicación'));
    labelFeatures.push(pointFeature(coordinate, '#facc15', 'Nueva ubicación'));
  }

  const directionsSource = map.getSource('delivery-directions') as GeoJSONSource | undefined;
  const labelsSource = map.getSource('delivery-labels') as GeoJSONSource | undefined;
  const couriersSource = map.getSource('courier-points') as GeoJSONSource | undefined;
  const deliveriesSource = map.getSource('delivery-points') as GeoJSONSource | undefined;
  directionsSource?.setData(featureCollection(directionFeatures));
  labelsSource?.setData(featureCollection(labelFeatures));
  couriersSource?.setData(featureCollection(courierFeatures));
  deliveriesSource?.setData(featureCollection(deliveryFeatures));

  const optimization = data.routes[0]?.optimization ?? null;
  const baseline = optimization?.baselineGeometry?.coordinates;
  const baselineFeatures: MapFeature[] =
    baseline && baseline.length > 1 && baseline.every(([lng, lat]) => isWithinPastoServiceArea(lat, lng))
      ? [{ type: 'Feature', geometry: { type: 'LineString', coordinates: baseline }, properties: { route: 'BASELINE' } }]
      : [];
  (map.getSource('route-baseline') as GeoJSONSource | undefined)?.setData(featureCollection(baselineFeatures));

  // Tráfico visible sobre la línea verde: halos por nivel, sin recolorear la ruta.
  if (!map.getSource('route-traffic')) {
    map.addSource('route-traffic', { type: 'geojson', data: featureCollection([]) });
    map.addLayer({
      id: 'route-traffic-halo',
      type: 'circle',
      source: 'route-traffic',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': 9,
        'circle-stroke-color': '#FFFCF7',
        'circle-stroke-width': 2,
      },
    });
  }
  const trafficFeatures: MapFeature[] = data.trafficMarks.map((mark) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: mark.coordinates },
    properties: { color: trafficColor(mark.trafficLevel, mark.roadClosure) },
  }));
  // Las mediciones que usó la optimización también se ven, aunque no haya consulta en vivo.
  for (const item of optimization?.trafficPoints ?? []) {
    if (!item.point || !isWithinPastoServiceArea(item.point[1], item.point[0])) continue;
    trafficFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: item.point },
      properties: { color: trafficColor(item.level ?? '', item.closed) },
    });
  }
  const trafficSource = map.getSource('route-traffic') as GeoJSONSource | undefined;
  trafficSource?.setData(featureCollection(trafficFeatures));

  // Los tramos más lentos llevan su porcentaje encima (min-heap de tamaño 3).
  if (!map.getSource('route-congestion')) {
    map.addSource('route-congestion', { type: 'geojson', data: featureCollection([]) });
    map.addLayer({
      id: 'route-congestion',
      type: 'symbol',
      source: 'route-congestion',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 12,
        'text-offset': [0, -1.5],
        'text-anchor': 'bottom',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#fff7ed',
        'text-halo-color': '#7c2d12',
        'text-halo-width': 2,
      },
    });
  }
  const congestionFeatures: MapFeature[] = mostCongested(optimization?.trafficPoints ?? [], 3).map(
    (item) => pointFeature(item.point, '#ea580c', congestionLabel(item, 'cerrado'))
  );
  (map.getSource('route-congestion') as GeoJSONSource | undefined)?.setData(
    featureCollection(congestionFeatures)
  );

  // El polling y el GPS actualizan marcadores sin interrumpir el zoom manual.
  const nextCameraKey = JSON.stringify({
    routes: data.routes.map((route) => route.id).sort(),
    selection: data.selectedCoordinate,
  });
  if (focusCoordinates.length === 0) return;
  if (cameraKey.current === nextCameraKey) return;
  cameraKey.current = nextCameraKey;

  if (focusCoordinates.length === 1) {
    map.setCenter(focusCoordinates[0]!);
    map.setZoom(16);
  } else if (focusCoordinates.length > 1) {
    const bounds = new maplibregl.LngLatBounds(focusCoordinates[0], focusCoordinates[0]);

    for (const coordinate of focusCoordinates.slice(1)) {
      bounds.extend(coordinate);
    }

    map.fitBounds(bounds, { maxZoom: 16, padding: 36, duration: 500 });
  }
}

function pointFeature(coordinate: [number, number], color: string, label: string): MapFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coordinate },
    properties: { color, label },
  };
}

function deliveryPointColor(status: MapDeliveryPoint['status']): string {
  switch (status) {
    case 'DELIVERED':
      return '#22c55e';
    case 'FAILED':
      return '#f43f5e';
    case 'EN_ROUTE':
      return '#38bdf8';
    default:
      return '#f59e0b';
  }
}

function emptyFeatureCollection(): MapFeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function featureCollection(features: MapFeature[]): MapFeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** Sello sobre el mapa: ahorro frente al orden base y quién intervino. */
function OptimizationBadge({ optimization }: { optimization: RouteOptimization }) {
  const t = useT();
  const saved = optimization.savedMinutes;
  return (
    <div className="rl-map-badge" role="note" aria-label={t('opt.badge')}>
      <p className="rl-map-badge-title">
        {saved !== null && saved > 0.05
          ? t('opt.saved', { min: saved.toLocaleString('es-CO', { maximumFractionDigits: 1 }) })
          : t('opt.already')}
      </p>
      <ul>
        <li>
          <span className="rl-map-key is-route" aria-hidden="true" />
          {t('opt.legend.optimized')}
        </li>
        {optimization.baselineGeometry ? (
          <li>
            <span className="rl-map-key is-baseline" aria-hidden="true" />
            {t('opt.legend.baseline')}
          </li>
        ) : null}
        {optimization.tomtom.sampled > 0 ? (
          <li>
            <span className="rl-map-key is-traffic" aria-hidden="true" />
            {t('opt.legend.tomtom', { n: optimization.tomtom.sampled })}
          </li>
        ) : null}
        {optimization.groq.orderAccepted ? <li className="is-ai">{t('opt.legend.aiAccepted')}</li> : null}
        {!optimization.groq.orderAccepted && optimization.groq.orderProposed ? (
          <li className="is-ai">{t('opt.legend.aiRejected')}</li>
        ) : null}
      </ul>
    </div>
  );
}
