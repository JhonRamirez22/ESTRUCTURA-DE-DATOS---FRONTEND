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
    <section aria-label="Optimizaciones en vivo" className="rp-feed rl-section mb-10">
      <div className="rl-head flex-wrap">
        <h2>
          Optimizaciones en vivo
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${paused ? 'bg-[var(--line-strong)]' : 'feed-pulse bg-[var(--route)]'}`}
          />
          <small>{paused ? 'En pausa' : 'Cada 5 s'}</small>
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

      <div className="mt-4 grid gap-x-10 gap-y-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {stats ? (
          <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-4">
            <Stat label="Propuestas calculadas" value={stats.proposals} />
            <Stat label="Respuestas desde caché" value={stats.cacheHits} />
            <Stat label="Rutas aplicadas" value={stats.applied} />
            <Stat label="Ahorro propuesto (min)" value={stats.savedMinutes} />
          </dl>
        ) : <div />}

        <div className="min-w-0">
          {error ? <p className="rl-notice is-warn mb-3" role="status">{error}</p> : null}
          {summary ? (
            <p className="rl-notice is-ok feed-enter mb-3 !block leading-6" role="status">
              <strong className="block font-semibold">Resumen de la IA (no cambia rutas)</strong>
              {summary}
            </p>
          ) : null}
          {summaryError ? <p className="rl-notice is-warn mb-3" role="status">{summaryError}</p> : null}

          <ol className="rl-rows max-h-72 overflow-y-auto" aria-live="polite">
            {events.length === 0 ? (
              <li className="rl-empty">Aún no hay optimizaciones. Aparecerán aquí cuando un repartidor tenga ruta activa.</li>
            ) : null}
            {events.map((event) => (
              <li key={`${event.at}-${event.routeAlias}-${event.kind}`} className="rl-row feed-enter flex-wrap !gap-x-3 !gap-y-1 text-sm">
                <time className="w-20 shrink-0 text-xs tabular-nums text-[var(--ink-soft)]" dateTime={event.at}>
                  {new Date(event.at).toLocaleTimeString('es-CO')}
                </time>
                <span className={`rl-state w-20 ${event.kind === 'aplicada' ? 'is-route' : 'is-muted'}`}>
                  {event.kind === 'aplicada' ? 'Aplicada' : 'Propuesta'}
                </span>
                <span className="font-semibold">Ruta {event.routeAlias}</span>
                <span className="text-[var(--ink-soft)]">{describe(event)}</span>
                {event.aiOrderAccepted ? (
                  <span className="text-xs font-semibold text-[var(--route-ink)]">
                    IA ordenó · verificado con Dijkstra −{event.aiOrderSavingMinutes ?? 0} min
                  </span>
                ) : event.aiApplied ? (
                  <span className="text-xs font-semibold text-[var(--route-ink)]">IA con ajustes validados</span>
                ) : null}
                {event.trafficSegments > 0 ? (
                  <span className="text-xs tabular-nums text-[var(--ink-soft)]">{event.trafficSegments} tramos medidos</span>
                ) : null}
              </li>
            ))}
          </ol>
          {feed?.incidents && feed.incidents.length > 0 ? (
            <p className="rl-notice is-warn mt-3 text-xs" role="status">
              Incidencias de proveedores recientes: {feed.incidents.slice(0, 3).map((item) => `${item.provider} (${item.kind})`).join(', ')}. El sistema reintentó y conservó el orden del algoritmo.
            </p>
          ) : null}
          <p className="mt-3 text-xs text-[var(--ink-soft)]">
            Las propuestas no cambian la ruta. Solo “Aplicada” guarda un nuevo orden. El historial vive en el servidor y se reinicia al reiniciarlo.
          </p>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-xs text-[var(--ink-soft)]">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
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
