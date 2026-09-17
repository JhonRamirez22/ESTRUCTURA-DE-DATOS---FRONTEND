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
