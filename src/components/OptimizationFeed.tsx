'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';

const REFRESH_MS = 5_000;

interface FeedEvent {
  at: string;
  kind: 'propuesta' | 'aplicada';
  routeAlias: string;
  changed: boolean;
  improvementMinutes: number | null;
  trafficSegments: number;
  aiApplied: boolean;
  aiOrderAccepted?: boolean;
  aiOrderSavingMinutes?: number;
}

interface Incident {
  at: string;
  provider: string;
  kind: string;
}

interface FeedPayload {
  events: FeedEvent[];
  incidents?: Incident[];
  stats: {
    proposals: number;
    cacheHits: number;
    applied: number;
    trafficSegments: number;
    savedMinutes: number;
  };
  summaryCooldownSeconds: number;
}

/** Panel en vivo: muestra lo que el sistema propone y aplica, sin cambiar ninguna ruta. */
export default function OptimizationFeed() {
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (inFlight.current || document.visibilityState === 'hidden') return;
    inFlight.current = true;
    try {
      const response = await apiFetch('/api/optimizaciones/recientes', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo actualizar el panel de optimizaciones.');
      const payload = (await response.json()) as FeedPayload;
      setFeed(payload);
      setCooldown(payload.summaryCooldownSeconds);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo actualizar el panel.');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (paused) return;
    void load();
    const interval = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [load, paused]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timeout = window.setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearTimeout(timeout);
  }, [cooldown]);

  const requestSummary = async (): Promise<void> => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const response = await apiFetch('/api/optimizaciones/resumen', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const payload = (await response.json().catch(() => ({}))) as {
        summary?: string; cooldownSeconds?: number; detail?: string; error?: string;
      };
      if (!response.ok) {
        setSummaryError(payload.detail ?? payload.error ?? 'No se pudo generar el resumen.');
        return;
      }
      setSummary(payload.summary ?? null);
      setCooldown(payload.cooldownSeconds ?? 0);
    } catch (summaryFailure) {
      setSummaryError(summaryFailure instanceof Error ? summaryFailure.message : 'No se pudo generar el resumen.');
    } finally {
      setSummarizing(false);
    }
  };

  const stats = feed?.stats;
  const events = feed?.events ?? [];

  return (
    <section aria-label="Optimizaciones en vivo" className="rp-feed mb-6">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
            <span className={`h-2.5 w-2.5 rounded-full ${paused ? 'bg-stone-400' : 'feed-pulse bg-[#3e9b6a]'}`} aria-hidden="true" />
            Optimizaciones en vivo
          </h2>
          <div className="flex flex-wrap gap-2">
            <button className="rp-button rp-button-quiet rp-button-small" onClick={() => setPaused((value) => !value)} type="button">
              {paused ? 'Reanudar' : 'Pausar'}
            </button>
            <button
              className="rp-button rp-button-primary rp-button-small"
              disabled={summarizing || cooldown > 0 || events.length === 0}
              onClick={() => void requestSummary()}
              type="button"
            >
              {summarizing ? 'Generando…' : cooldown > 0 ? `Resumen IA en ${cooldown} s` : 'Resumen con IA'}
            </button>
          </div>
        </div>

        {stats ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Propuestas calculadas" value={stats.proposals} />
            <Stat label="Respuestas desde caché" value={stats.cacheHits} />
            <Stat label="Rutas aplicadas" value={stats.applied} />
            <Stat label="Ahorro propuesto (min)" value={stats.savedMinutes} />
          </dl>
        ) : null}

        {error ? <p className="mt-3 text-sm text-amber-900" role="status">{error}</p> : null}
        {summary ? (
          <p className="feed-enter mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950" role="status">
            <strong className="block text-sm font-semibold text-teal-900">Resumen de la IA (no cambia rutas)</strong>
            {summary}
          </p>
        ) : null}
        {summaryError ? <p className="mt-3 text-sm text-amber-900" role="status">{summaryError}</p> : null}

        <ol className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1" aria-live="polite">
          {events.length === 0 ? (
            <li className="text-sm text-stone-600">Aún no hay optimizaciones. Aparecerán aquí cuando un repartidor tenga ruta activa.</li>
          ) : null}
          {events.map((event) => (
            <li key={`${event.at}-${event.routeAlias}-${event.kind}`} className="feed-enter flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
              <time className="w-20 text-xs tabular-nums text-stone-600" dateTime={event.at}>
                {new Date(event.at).toLocaleTimeString('es-CO')}
              </time>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${event.kind === 'aplicada' ? 'bg-emerald-100 text-emerald-900' : 'bg-teal-100 text-teal-900'}`}>
                {event.kind === 'aplicada' ? 'Aplicada' : 'Propuesta'}
              </span>
              <span className="font-medium text-stone-900">Ruta {event.routeAlias}</span>
              <span className="text-stone-700">{describe(event)}</span>
              {event.aiApplied ? <span className="text-xs text-violet-800">IA con ajustes validados</span> : null}
              {event.aiOrderAccepted ? (
                <span className="text-xs text-violet-800">
                  IA ordenó · verificado con Dijkstra −{event.aiOrderSavingMinutes ?? 0} min
                </span>
              ) : null}
              {event.trafficSegments > 0 ? <span className="text-xs text-stone-600">{event.trafficSegments} tramos medidos</span> : null}
            </li>
          ))}
        </ol>
        {feed?.incidents && feed.incidents.length > 0 ? (
          <p className="mt-3 text-xs text-amber-900" role="status">
            Incidencias de proveedores recientes: {feed.incidents.slice(0, 3).map((item) => `${item.provider} (${item.kind})`).join(', ')}. El sistema reintentó y conservó el orden del algoritmo.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-stone-500">
          Las propuestas no cambian la ruta. Solo “Aplicada” guarda un nuevo orden. El historial vive en el servidor y se reinicia al reiniciarlo.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-stone-50 px-3 py-2">
      <dt className="text-xs text-stone-600">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-stone-900">{value}</dd>
    </div>
  );
}

function describe(event: FeedEvent): string {
  if (event.kind === 'aplicada') return 'El repartidor aplicó el nuevo orden.';
  if (!event.changed) return 'El orden actual sigue siendo el mejor con el tráfico de ahora.';
  return event.improvementMinutes !== null && event.improvementMinutes > 0
    ? `Reordenaría paradas · ahorro ~${event.improvementMinutes.toFixed(1)} min`
    : 'Reordenaría paradas según el tráfico de ahora.';
}
