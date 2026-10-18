'use client';

import { layersFactory } from '@maplibre/maplibre-gl-directions';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { isWithinPastoServiceArea, PASTO_SERVICE_BOUNDS } from '@/lib/pastoArea';
import { getPastoMapCenter } from '@/lib/mapCenter';
import { getPastoMinimumZoom } from '@/lib/mapViewport';
import TrafficOverlay from './TrafficOverlay';
import { isRoadGeometryProvider } from '@/lib/roadGeometry';
import { isMapStyleAuthorizationError } from './mapStyleFallback';

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
}

interface MapLibreRouteMapProps {
  couriers: MapCourier[];
  routes: MapRoute[];
  pendingPoints?: MapDeliveryPoint[];
  selectedCoordinate?: [number, number] | null;
  onMapClick?: (coordinate: { lat: number; lng: number }) => void;
  className?: string;
  ariaLabel?: string;
  showTraffic?: boolean;
}

type MapStatus = 'loading' | 'slow' | 'unavailable' | 'ready';

interface MapProperties {
  color?: string;
  label?: string;
  route?: 'SELECTED' | 'ALT';
  congestion?: number;
  profile?: 'driving';
}

type MapFeature = GeoJSON.Feature<GeoJSON.Point | GeoJSON.LineString, MapProperties>;
type MapFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point | GeoJSON.LineString,
  MapProperties
>;

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
// El fallback usa teselas oscuras para que una caída del estilo vectorial no
// cambie bruscamente la lectura operativa del mapa ni oculte las rutas verdes.
const FALLBACK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    cartoDark: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    {
      id: 'carto-dark',
      type: 'raster',
      source: 'cartoDark',
      paint: {
        'raster-saturation': -0.1,
        'raster-contrast': 0.08,
      },
    },
  ],
};

export default function MapLibreRouteMap({
  ariaLabel = 'Mapa de rutas',
  className = 'h-[min(68vh,680px)] min-h-[400px] w-full',
  couriers,
  onMapClick,
  pendingPoints = [],
  routes,
  selectedCoordinate = null,
  showTraffic = false,
}: MapLibreRouteMapProps) {
  const [mapStatus, setMapStatus] = useState<MapStatus>('loading');
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const retryMapRef = useRef<(() => void) | null>(null);
  const cameraKeyRef = useRef<string | null>(null);
  const dataRef = useRef({ couriers, pendingPoints, routes, selectedCoordinate });
  dataRef.current = { couriers, pendingPoints, routes, selectedCoordinate };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

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
    const slowTimer = window.setTimeout(() => setMapStatus('slow'), 7000);
    const unavailableTimer = window.setTimeout(() => setMapStatus('unavailable'), 20000);
    const markMapReady = () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(unavailableTimer);
      setMapStatus('ready');
    };
    const renderData = () => {
      if (!map.isStyleLoaded()) return;
      addMapLayers(map);
      updateMapData(map, dataRef.current, cameraKeyRef);
      map.once('idle', markMapReady);
    };
    const applyFallbackStyle = () => {
      if (fallbackApplied) {
        return;
      }

      fallbackApplied = true;
      window.clearTimeout(fallbackTimer);
      map.setStyle(FALLBACK_STYLE);
    };
    retryMapRef.current = () => {
      window.clearTimeout(fallbackTimer);
      setMapStatus('loading');
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
    fallbackTimer = window.setTimeout(() => {
      if (!map.isStyleLoaded() && !fallbackApplied) {
        applyFallbackStyle();
      }
    }, 5000);

    map.on('style.load', renderData);
    map.on('webglcontextrestored', renderData);
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
      map.off('style.load', renderData);
      map.off('webglcontextrestored', renderData);
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

    updateMapData(map, { couriers, pendingPoints, routes, selectedCoordinate }, cameraKeyRef);
  }, [couriers, pendingPoints, routes, selectedCoordinate]);

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
      {showTraffic && mapStatus === 'ready' && mapRef.current ? (
        <TrafficOverlay map={mapRef.current} />
      ) : null}
      <button
        className="rp-button rp-button-secondary absolute left-3 top-3 z-10"
        onClick={() => {
          const map = mapRef.current;
          if (!map?.isStyleLoaded()) return;
          cameraKeyRef.current = null;
          updateMapData(map, dataRef.current, cameraKeyRef);
        }}
        type="button"
      >
        Centrar entregas
      </button>
      {mapStatus !== 'ready' ? (
        <div
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
  if (!map.getSource('delivery-directions')) {
    map.addSource('delivery-directions', {
      type: 'geojson',
      data: emptyFeatureCollection(),
    });

    // Capas oficiales del plugin: casing, rutas alternativas, ruta seleccionada
    // y colores de congestión de verde a rojo.
    for (const layer of layersFactory(1.2, 1.25, 'delivery-directions')) {
      map.addLayer(layer);
    }

    // Línea operativa superior: garantiza que el trayecto seleccionado siga
    // siendo visible aunque todavía no exista un factor de tráfico histórico.
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

