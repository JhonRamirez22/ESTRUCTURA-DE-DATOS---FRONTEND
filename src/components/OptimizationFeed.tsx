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
