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

      <ul aria-label={t('live.legend')} className="rp-live-legend">
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
