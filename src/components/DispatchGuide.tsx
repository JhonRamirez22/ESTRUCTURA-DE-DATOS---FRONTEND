'use client';

import { useEffect, useState } from 'react';
import type { DispatchFlow } from '@/lib/dispatchFlow';
import { useT } from '@/lib/preferences';

interface Counts {
  orders: number;
  couriers: number;
  pending: number;
  availableCouriers: number;
}

/** Segundos transcurridos mientras `active`; vuelve a cero al terminar. */
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  return seconds;
}

/** Tres pasos a la vista: dónde está el despachador y qué falta para despachar. */
export function DispatchSteps({ flow, counts }: { flow: DispatchFlow; counts: Counts }) {
  const t = useT();
