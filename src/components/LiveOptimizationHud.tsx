'use client';

import type { LiveOptimizationState } from '@/lib/useLiveOptimization';
import { appliableRoutes, isReorderOnly, type LiveRouteProposal } from '@/lib/liveOptimization';
import { useT } from '@/lib/preferences';

const fmt = (value: number): string =>
  value.toLocaleString('es-CO', { maximumFractionDigits: 1 });

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
}: {
  state: LiveOptimizationState;
  routes: HudRoute[];
  intervalSeconds?: number;
  applying: boolean;
  onApplyAll: () => void;
}) {
  const t = useT();
  const { proposal, status, secondsLeft, computing, tick } = state;
  if (status === 'disabled' || routes.length === 0) return null;
  const progress = Math.round(100 * (1 - Math.min(secondsLeft, intervalSeconds) / intervalSeconds));
  const gains = appliableRoutes(proposal);
  const before = proposal?.scoreBefore;
  const after = proposal?.scoreAfter;
  const perRoute = new Map((proposal?.routes ?? []).map((item) => [item.routeId, item]));

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
