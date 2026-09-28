'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { LruCache } from '@/lib/lruCache';

const REFRESH_MS = 90_000;
type TrafficState = 'loading' | 'consulted' | 'stale' | 'unavailable' | 'no-coverage';
interface Observation {
  observedAt: string;
  cacheStatus: string;
  roadClosure: boolean;
  trafficLevel?: 'FLUIDO' | 'MODERADO' | 'ALTO' | 'MUY_ALTO' | 'CERRADO' | 'DESCONOCIDO';
}
interface RouteTraffic {
  configured: boolean;
  available: boolean;
  observations: Observation[];
}

// Últimas rutas consultadas: al volver a una de ellas se reutiliza la medición vigente.
const recentTraffic = new LruCache<string, RouteTraffic>(8, REFRESH_MS);

export function clearTrafficCache(): void {
  recentTraffic.clear();
}

/** Informa sobre la ruta elegida sin pintar tráfico ni recorridos adicionales. */
export default function TrafficOverlay({ routeId }: { routeId: string }) {
  const [status, setStatus] = useState<TrafficState>('loading');
  const [snapshot, setSnapshot] = useState<RouteTraffic | null>(null);

  useEffect(() => {
    let disposed = false;
    let pending: AbortController | null = null;
    let lastRefresh = -Infinity;
    let previous: RouteTraffic | null = null;
    const cached = recentTraffic.get(routeId);
    if (cached !== undefined) {
      previous = cached;
      lastRefresh = Date.now();
      setSnapshot(cached);
      setStatus('consulted');
    } else {
      setSnapshot(null);
      setStatus('loading');
    }

    const refresh = async () => {
      if (document.visibilityState === 'hidden' || Date.now() - lastRefresh < REFRESH_MS) return;
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      lastRefresh = Date.now();
      try {
        const response = await apiFetch(
          `/api/v1/rutas/${encodeURIComponent(routeId)}/trafico-vivo`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error('No se pudo consultar el tráfico de la ruta.');
        const data = (await response.json()) as RouteTraffic;
        if (disposed || controller.signal.aborted) return;
        const observations = data.observations.filter((item) =>
          Number.isFinite(Date.parse(item.observedAt))
        );
        previous = { ...data, observations };
        recentTraffic.set(routeId, previous);
        setSnapshot(previous);
        setStatus(
          !data.configured
            ? 'unavailable'
            : !data.available || observations.length === 0
              ? 'no-coverage'
