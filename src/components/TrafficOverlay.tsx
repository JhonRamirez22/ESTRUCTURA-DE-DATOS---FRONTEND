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
