'use client';

import type { Map as MapLibreMap, MapSourceDataEvent, RasterTileSource } from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { PASTO_SERVICE_BOUNDS } from '@/lib/pastoArea';

const SOURCE = 'rutas-pasto-traffic';
const LAYER = 'rutas-pasto-traffic-flow';
const REFRESH_MS = 90_000;
type TrafficState = 'loading' | 'consulted' | 'stale' | 'unavailable' | 'no-coverage';

export default function TrafficOverlay({ map }: { map: MapLibreMap }) {
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<TrafficState>('loading');
  const [observedAt, setObservedAt] = useState<string | null>(null);

  useEffect(() => {
    let configured = false;
    let lastRefresh = 0;
    let lastBucket = Math.floor(Date.now() / REFRESH_MS);
    let readbackBucket = -1;
    let failedBucket = -1;
    let pending: AbortController | null = null;
    const remove = () => {
      if (!map.getStyle()) return;
      if (map.getLayer(LAYER)) map.removeLayer(LAYER);
      if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    };
    const install = () => {
      if (!enabled || !configured || document.visibilityState === 'hidden' || !map.isStyleLoaded())
        return;
      const tiles = [
        `${window.location.origin}/api/v1/trafico/tiles/{z}/{x}/{y}.png?t=${lastBucket}`,
      ];
      const existing = map.getSource(SOURCE) as RasterTileSource | undefined;
      if (existing) {
        existing.setTiles(tiles);
        return;
      }
      map.addSource(SOURCE, {
        type: 'raster',
        tiles,
        tileSize: 256,
        minzoom: 11,
        maxzoom: 18,
        bounds: [
          PASTO_SERVICE_BOUNDS.minLongitude,
          PASTO_SERVICE_BOUNDS.minLatitude,
          PASTO_SERVICE_BOUNDS.maxLongitude,
          PASTO_SERVICE_BOUNDS.maxLatitude,
        ],
        attribution: 'Traffic © TomTom',
      });
      map.addLayer(
        {
          id: LAYER,
          type: 'raster',
          source: SOURCE,
          paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0 },
        },
        map.getLayer('delivery-route-highlight-casing')
          ? 'delivery-route-highlight-casing'
          : undefined
      );
    };
    const metadata = async (refresh: boolean) => {
      if (!enabled || document.visibilityState === 'hidden') return;
      if (refresh && Date.now() - lastRefresh < REFRESH_MS) {
        install();
        return;
      }
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      try {
        const response = await apiFetch('/api/v1/trafico/estado', { signal: controller.signal });
        if (!response.ok) throw new Error('Tráfico no disponible');
        const data = (await response.json()) as {
          configured: boolean;
          observedAt: string | null;
          state: string;
        };
        if (controller.signal.aborted) return;
        configured = data.configured;
        setObservedAt(data.observedAt);
        if (!configured || failedBucket !== lastBucket || data.state === 'stale') {
          setStatus(
            !configured
              ? 'unavailable'
              : data.state === 'stale'
                ? 'stale'
                : data.state === 'consulted'
                  ? 'consulted'
                  : 'loading'
          );
        }
        if (!configured) {
          remove();
          return;
        }
        if (refresh) {
          lastRefresh = Date.now();
          lastBucket = Math.floor(lastRefresh / REFRESH_MS);
          install();
        }
      } catch {
        if (!controller.signal.aborted) setStatus('unavailable');
      }
    };
    const sourceLoaded = (event: MapSourceDataEvent) => {
      if (event.sourceId === SOURCE && event.isSourceLoaded && readbackBucket !== lastBucket) {
        readbackBucket = lastBucket;
        void metadata(false);
      }
    };
    const error = (event: { sourceId?: string; error?: Error & { status?: number } }) => {
      if (event.sourceId !== SOURCE) return;
      failedBucket = lastBucket;
      setStatus(event.error?.status === 404 ? 'no-coverage' : 'unavailable');
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        pending?.abort();
        remove();
      } else void metadata(true);
    };
    map.on('style.load', install);
    map.on('sourcedata', sourceLoaded);
    map.on('error', error);
    document.addEventListener('visibilitychange', visibility);
    if (enabled) void metadata(true);
    else remove();
    const timer = window.setInterval(() => {
      if (enabled) void metadata(true);
    }, REFRESH_MS);
    return () => {
      pending?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      map.off('style.load', install);
      map.off('sourcedata', sourceLoaded);
      map.off('error', error);
      remove();
    };
  }, [map, enabled]);

  const labels: Record<TrafficState, string> = {
    loading: 'Consultando tráfico…',
    consulted: 'Tráfico consultado',
    stale: 'Datos anteriores',
    unavailable: 'Tráfico no disponible',
    'no-coverage': 'Sin cobertura en esta área',
  };
  const time =
    observedAt && Number.isFinite(Date.parse(observedAt))
      ? new Date(observedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
      : null;
  return (
    <div className="rp-traffic-panel absolute bottom-3 left-3 z-10 max-w-[calc(100%-84px)] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--text)] shadow-sm">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Tráfico TomTom
      </label>
      {enabled ? (
        <>
          <p role="status">
            {labels[status]}
            {time ? ` · ${time}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap gap-2" aria-label="Congestión relativa">
            <span>
              <i
                aria-hidden="true"
                className="mr-1 inline-block h-2 w-2 rounded-full bg-green-600"
              />
              Fluido
            </span>
            <span>
              <i
                aria-hidden="true"
                className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500"
              />
              Lento
            </span>
            <span>
              <i aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full bg-red-600" />
              Congestión
            </span>
          </div>
          <p className="mt-1 opacity-75">Sin color no confirma vía libre.</p>
        </>
      ) : null}
    </div>
  );
}
