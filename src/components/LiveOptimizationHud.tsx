'use client';

import type { LiveOptimizationState } from '@/lib/useLiveOptimization';
import {
  appliableRoutes,
  isReorderOnly,
  type LiveExplanation,
  type LiveRouteProposal,
} from '@/lib/liveOptimization';
import { useT } from '@/lib/preferences';

const fmt = (value: number): string =>
  value.toLocaleString('es-CO', { maximumFractionDigits: 1 });

/** Fills the {route} {stop} {from} {to} markers with names the server never saw. */
export function fillExplanation(
  item: LiveExplanation,
  routeNames: ReadonlyMap<string, string>,
  stopLabels: Readonly<Record<string, string>>,
): string {
  const route = (id: string | null): string => (id ? routeNames.get(id) : undefined) ?? 'otra ruta';
  const stop = item.stopId ? (stopLabels[item.stopId] ?? 'una parada') : 'una parada';
  return item.text
    .split('{route}').join(route(item.routeId))
    .split('{stop}').join(stop)
    .split('{from}').join(route(item.fromRouteId))
    .split('{to}').join(route(item.toRouteId));
}

export interface HudRoute {
  id: string;
  courierName: string;
  color: string;
}

/** Floating panel over the map: the live recalculation clock, the gains and who gets which colour. */
export function LiveOptimizationHud({
  state,
  routes,
  intervalSeconds = 10,
  applying,
  onApplyAll,
  stopLabels = {},
}: {
  state: LiveOptimizationState;
  routes: HudRoute[];
  intervalSeconds?: number;
  applying: boolean;
  onApplyAll: () => void;
  stopLabels?: Readonly<Record<string, string>>;
}) {
  const t = useT();
  const { proposal, status, secondsLeft, computing, tick } = state;
  if (status === 'disabled' || routes.length === 0) return null;
  const progress = Math.round(100 * (1 - Math.min(secondsLeft, intervalSeconds) / intervalSeconds));
  const gains = appliableRoutes(proposal);
  const before = proposal?.scoreBefore;
  const after = proposal?.scoreAfter;
  const perRoute = new Map((proposal?.routes ?? []).map((item) => [item.routeId, item]));
  const routeNames = new Map(routes.map((route) => [route.id, route.courierName]));
  const explanations = proposal?.explanations ?? [];
  const headline = explanations.find((item) => item.kind === 'next' && item.routeId === proposal?.focusRouteId);
  const reasons = explanations.filter((item) => item.kind !== 'next').slice(0, 5);
  const aiWritten = proposal?.explanationSource === 'ai' || proposal?.explanationSource === 'cached';

  return (
    <aside aria-label={t('live.title')} className="rp-live-hud" role="status">
      <div className="rp-live-head">
        <span
          aria-hidden="true"
          className={`rp-live-ring ${computing ? 'is-computing' : ''}`}
          style={{ '--p': progress } as React.CSSProperties}
        >
          {computing ? '…' : secondsLeft}
        </span>
        <div className="min-w-0">
          <strong>{t('live.title')}</strong>
          <small>
            {computing ? t('live.computing') : t('live.next', { s: secondsLeft })}
            {tick > 0 ? ` · ${t('live.count', { n: tick })}` : ''}
          </small>
        </div>
      </div>

      {status === 'error' ? <p className="rp-live-warn">{t('live.error')}</p> : null}
      {proposal?.approximate ? <p className="rp-live-warn">{t('live.approx')}</p> : null}

      {proposal && proposal.changed ? (
        <div className="rp-live-gain">
          <p className="rp-live-big">
            {t('live.better', { min: fmt(Math.max(0, proposal.savedMinutes)) })}
          </p>
          {before && after ? (
            <ul>
              {before.longestMinutes !== after.longestMinutes ? (
                <li>{t('live.longest', { a: fmt(before.longestMinutes), b: fmt(after.longestMinutes) })}</li>
              ) : null}
              {before.balance !== after.balance ? (
                <li>{t('live.balance', { a: fmt(before.balance), b: fmt(after.balance) })}</li>
              ) : null}
              {before.crossings !== after.crossings ? (
                <li>{t('live.crossings', { a: before.crossings, b: after.crossings })}</li>
              ) : null}
            </ul>
          ) : null}
          {proposal.moves.length > 0 ? (
            <p className="rp-live-note">{t('live.moves', { n: proposal.moves.length })}</p>
          ) : null}
          {gains.length > 0 ? (
            <button className="rp-button rp-button-go rp-button-small" disabled={applying} onClick={onApplyAll} type="button">
              {applying ? t('improve.applying') : t('live.applyAll', { n: gains.length })}
            </button>
          ) : null}
        </div>
      ) : proposal ? (
        <p className="rp-live-ok">✓ {t('live.ok')}</p>
      ) : null}

      {headline ? (
        <p className="rp-live-now">
          <span aria-hidden="true" className="rp-live-dot is-next" />
          <span>
            <strong>{t('live.nextNow')}</strong> {fillExplanation(headline, routeNames, stopLabels)}
          </span>
        </p>
      ) : null}

      {reasons.length > 0 ? (
        <section aria-label={t('live.why')} className="rp-live-why">
          <h3>
            {t('live.why')}
            {aiWritten ? <span className="rp-live-ai">{t('live.ai')}</span> : null}
          </h3>
          <ul>
            {reasons.map((item) => (
              <li key={item.id}>{fillExplanation(item, routeNames, stopLabels)}</li>
            ))}
          </ul>
          <small>{aiWritten ? t('live.whyAi') : t('live.whyCalc')}</small>
        </section>
      ) : null}

      <ul aria-label={t('live.legend')} className="rp-live-legend">
        <li>
          <span aria-hidden="true" className="rp-live-dot is-next" />
          <span className="truncate">{t('live.legend.next')}</span>
        </li>
        {routes.map((route) => {
          const item = perRoute.get(route.id);
          const saved = item?.changed ? item.savedMinutes : 0;
          return (
            <li key={route.id}>
              <span aria-hidden="true" className="rp-live-dot" style={{ background: route.color }} />
              <span className="truncate">{route.courierName}</span>
              {item?.changed ? (
                <small className={saved > 0 ? 'is-gain' : ''}>
                  {saved > 0 ? `−${fmt(saved)} min` : t('live.rebalanced')}
                </small>
              ) : null}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

/** What the live recalculation suggests for one route card. */
export function LiveRouteSuggestion({
  proposal,
  applying,
  onApply,
}: {
  proposal: LiveRouteProposal;
  applying: boolean;
  onApply: () => void;
}) {
  const t = useT();
  if (!proposal.changed) {
    return <p className="mt-3 text-xs text-[var(--ink-soft)]">✓ {t('live.route.same')}</p>;
  }
  const moves = proposal.movedIn.length + proposal.movedOut.length;
  return (
    <div className="rl-notice is-ok !block mt-3 text-sm" role="status">
      {isReorderOnly(proposal) && proposal.savedMinutes >= 0.2 ? (
        <>
          <p className="font-semibold">
            {t('live.route.reorder', {
              min: fmt(proposal.savedMinutes),
              a: proposal.currentMinutes === null ? '—' : fmt(proposal.currentMinutes),
              b: proposal.proposedMinutes === null ? '—' : fmt(proposal.proposedMinutes),
            })}
          </p>
          <button className="rp-button rp-button-go rp-button-small mt-2" disabled={applying} onClick={onApply} type="button">
            {applying ? t('improve.applying') : t('live.route.apply')}
          </button>
        </>
      ) : null}
      {moves > 0 ? <p className="leading-5">{t('live.route.moves', { n: moves })}</p> : null}
    </div>
  );
}
