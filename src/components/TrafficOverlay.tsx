'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';

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

/** Informa sobre la ruta elegida sin pintar tráfico ni recorridos adicionales. */
export default function TrafficOverlay({ routeId }: { routeId: string }) {
  const [status, setStatus] = useState<TrafficState>('loading');
  const [snapshot, setSnapshot] = useState<RouteTraffic | null>(null);

  useEffect(() => {
    let disposed = false;
    let pending: AbortController | null = null;
    let lastRefresh = -Infinity;
    let previous: RouteTraffic | null = null;
    setSnapshot(null);
    setStatus('loading');

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
        setSnapshot(previous);
        setStatus(
          !data.configured
            ? 'unavailable'
            : !data.available || observations.length === 0
              ? 'no-coverage'
              : observations.some(
                    (item) =>
                      item.cacheStatus === 'STALE' ||
                      Date.now() - Date.parse(item.observedAt) >= REFRESH_MS
                  )
                ? 'stale'
                : 'consulted'
        );
      } catch {
        if (!disposed && !controller.signal.aborted) {
          setStatus(previous?.observations.length ? 'stale' : 'unavailable');
        }
      }
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') pending?.abort();
      else void refresh();
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), REFRESH_MS);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      pending?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [routeId]);

  const labels: Record<TrafficState, string> = {
    loading: 'Consultando esta ruta…',
    consulted: 'Tráfico de esta ruta',
    stale: 'Datos anteriores de esta ruta',
    unavailable: 'Tráfico no disponible',
    'no-coverage': 'Sin cobertura utilizable en esta ruta',
  };
  const observations = snapshot?.observations ?? [];
  const trafficDescription = observations.some(
    (item) => item.roadClosure || item.trafficLevel === 'CERRADO'
  )
    ? 'Cierre reportado'
    : observations.some((item) => item.trafficLevel === 'ALTO' || item.trafficLevel === 'MUY_ALTO')
      ? 'Demoras detectadas'
      : observations.some((item) => item.trafficLevel === 'MODERADO')
        ? 'Tráfico moderado'
        : observations.length > 0 && observations.every((item) => item.trafficLevel === 'FLUIDO')
          ? 'Fluido en los puntos consultados'
          : 'Señal parcial';
  const oldest = observations.length
    ? Math.min(...observations.map((item) => Date.parse(item.observedAt)))
    : null;
  const time =
    oldest === null
      ? null
      : new Date(oldest).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className="rp-traffic-panel absolute bottom-3 left-3 z-10 max-w-[calc(100%-84px)] rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-xs text-[var(--foreground)] shadow-sm">
      <p className="font-semibold">TomTom · recorrido seleccionado</p>
      <p role="status">
        {labels[status]}
        {time ? ` · ${time}` : ''}
      </p>
      {observations.length > 0 ? (
        <p className="mt-1 opacity-75">
          {observations.length} puntos muestreados · cobertura parcial
          {' · '}
          {trafficDescription}
        </p>
      ) : null}
    </div>
  );
}
