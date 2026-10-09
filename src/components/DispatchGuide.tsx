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
  flow: DispatchFlow;
  counts: Counts;
  onAct: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const busy = flow.phase === 'analyzing' || flow.phase === 'dispatching';
  const seconds = useElapsedSeconds(busy);
  const orderWord = t(counts.orders === 1 ? 'flow.word.order.one' : 'flow.word.order.other');
  const courierWord = t(counts.couriers === 1 ? 'flow.word.courier.one' : 'flow.word.courier.other');
  const params = { orders: counts.orders, couriers: counts.couriers, orderWord, courierWord, s: seconds };

  const label: Record<DispatchFlow['phase'], string> = {
    'no-orders': t('flow.noOrders'),
    'pick-orders': t('flow.pickOrders'),
    'no-couriers': t('flow.noCouriers'),
    'pick-couriers': t('flow.pickCouriers'),
    ready: t('flow.analyze', params),
    analyzing: t('flow.analyzing', params),
    proposal: t('flow.dispatch', params),
    stale: t('flow.reanalyze'),
    dispatching: t('flow.dispatching', params),
  };
  const hint: Partial<Record<DispatchFlow['phase'], string>> = {
    'no-orders': t('flow.hint.noOrders'),
    'pick-orders': t('flow.hint.pickOrders'),
    'no-couriers': t('flow.hint.noCouriers'),
    'pick-couriers': t('flow.hint.pickCouriers'),
    ready: t('flow.hint.ready'),
    analyzing: t('flow.hint.analyzing'),
    proposal: t('flow.hint.proposal'),
    stale: t('flow.hint.stale'),
    dispatching: t('flow.hint.dispatching'),
  };
  const showBack = flow.phase === 'proposal' || flow.phase === 'stale';

  return (
    <div className="grid gap-2">
      <p className={`dispatch-hint ${flow.canAct && !busy ? '' : 'is-reason'}`} id="dispatch-hint" role="status">
        {hint[flow.phase]}
      </p>
      <button
        aria-describedby="dispatch-hint"
        aria-busy={busy}
        className={`rp-button rp-button-block ${flow.actionIsDispatch ? 'rp-button-go' : 'rp-button-primary'}`}
        data-tip={flow.actionIsDispatch ? 'tip.dispatch' : 'tip.analyze'}
        disabled={!flow.canAct}
        onClick={onAct}
        type="button"
      >
        {label[flow.phase]}
      </button>
      {showBack ? (
        <button className="rp-button rp-button-quiet rp-button-small justify-self-center" onClick={onBack} type="button">
          {t('flow.back')}
        </button>
      ) : null}
    </div>
  );
}
