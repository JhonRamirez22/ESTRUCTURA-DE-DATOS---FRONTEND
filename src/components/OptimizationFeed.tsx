'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/preferences';
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
  const t = useT();
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
          {t('feed.title')}
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full ${paused ? 'bg-[var(--line-strong)]' : 'feed-pulse bg-[var(--route)]'}`}
          />
          <small>{paused ? t('feed.paused') : t('feed.every')}</small>
        </h2>
        <div className="flex flex-wrap gap-2">
          <button className="rp-button rp-button-quiet rp-button-small" data-tip="tip.pauseFeed" onClick={() => setPaused((value) => !value)} type="button">
            {paused ? t('feed.resume') : t('feed.pause')}
          </button>
          <button
            className="rp-button rp-button-primary rp-button-small"
            data-tip="tip.summary"
            disabled={summarizing || cooldown > 0 || events.length === 0}
            onClick={() => void requestSummary()}
