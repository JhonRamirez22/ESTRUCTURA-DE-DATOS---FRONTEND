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

