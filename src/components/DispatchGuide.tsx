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
  const steps = [
    { n: 1, label: t('flow.step.orders'), detail: `${counts.orders}/${counts.pending}` },
    { n: 2, label: t('flow.step.couriers'), detail: `${counts.couriers}/${counts.availableCouriers}` },
    { n: 3, label: t('flow.step.review'), detail: '' },
  ] as const;
  return (
    <ol aria-label={t('flow.steps')} className="dispatch-steps">
      {steps.map((step) => {
        const state = step.n < flow.step ? 'done' : step.n === flow.step ? 'current' : 'todo';
        return (
          <li aria-current={state === 'current' ? 'step' : undefined} className={`dispatch-step is-${state}`} key={step.n}>
            <span aria-hidden="true" className="dispatch-step-n">{state === 'done' ? '✓' : step.n}</span>
            <span className="dispatch-step-text">
              {step.label}
              {step.detail ? <small>{step.detail}</small> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Un solo botón principal cuyo texto dice qué hará y, si no se puede, por qué. */
export function DispatchAction({
  flow,
  counts,
  onAct,
  onBack,
}: {
