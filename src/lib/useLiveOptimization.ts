'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson, ApiRequestError } from '@/lib/apiClient';
import { secondsUntil, type LiveProposal } from '@/lib/liveOptimization';

export type LiveStatus = 'idle' | 'ok' | 'error' | 'disabled';

export interface LiveOptimizationState {
  proposal: LiveProposal | null;
  status: LiveStatus;
  /** Seconds until the next recalculation. */
  secondsLeft: number;
  /** True while a recalculation is in flight. */
  computing: boolean;
  /** Number of completed recalculations; changes on every tick, even if nothing changed. */
  tick: number;
  refresh: () => void;
}

const RATE_LIMIT_BACKOFF_MS = 30_000;
const POLL_PATH = '/api/optimizaciones/en-vivo';

/** Recalculates the whole fleet every ``intervalMs`` while enabled and the tab is visible. */
export function useLiveOptimization(enabled: boolean, intervalMs = 10_000): LiveOptimizationState {
  const [proposal, setProposal] = useState<LiveProposal | null>(null);
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(intervalMs / 1000));
  const [computing, setComputing] = useState(false);
  const [tick, setTick] = useState(0);
  const nextAtRef = useRef(0);
  const refreshRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!enabled) {
      setProposal(null);
      setStatus('idle');
      setComputing(false);
      return;
    }
    let disposed = false;
    let inFlight = false;
    let controller: AbortController | null = null;

    const run = async (): Promise<void> => {
      if (disposed || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      const startedAt = Date.now();
      nextAtRef.current = startedAt + intervalMs;
      controller = new AbortController();
      setComputing(true);
      try {
        const data = await apiJson<LiveProposal>(POLL_PATH, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (disposed) return;
        setProposal(data.enabled ? data : null);
        setStatus(data.enabled ? 'ok' : 'disabled');
        setTick((current) => current + 1);
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        setStatus('error');
        // The last good proposal stays on screen; a rate limit just slows the cadence down.
        if (error instanceof ApiRequestError && error.status === 429) {
          nextAtRef.current = Date.now() + RATE_LIMIT_BACKOFF_MS;
