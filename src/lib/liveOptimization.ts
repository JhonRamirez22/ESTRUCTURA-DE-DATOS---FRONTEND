export interface LiveScore {
  totalMinutes: number;
  longestMinutes: number;
  balance: number;
  crossings: number;
  lowerBoundGap: number | null;
}

export interface LiveRouteProposal {
  routeId: string;
  changed: boolean;
  currentOrder: string[];
  proposedOrder: string[];
  movedIn: string[];
  movedOut: string[];
  currentMinutes: number | null;
  proposedMinutes: number | null;
  savedMinutes: number;
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> } | null;
}

export interface LiveMove {
  stopId: string;
  fromRouteId: string;
  toRouteId: string;
  gainMinutes: number;
}

export interface LiveNextStop {
  routeId: string;
  stopId: string;
  etaMinutes: number;
  focus: boolean;
}

/** One reason behind a change. Text carries {stop} {route} {from} {to} for the client to fill in. */
export interface LiveExplanation {
  id: string;
  kind: 'next' | 'move' | 'reorder' | 'crossings' | 'balance' | 'stable';
  text: string;
  source: 'deterministic' | 'groq-validated';
  routeId: string | null;
  stopId: string | null;
  fromRouteId: string | null;
  toRouteId: string | null;
}

export interface LiveProposal {
  nextStops?: LiveNextStop[];
  focusRouteId?: string | null;
  explanations?: LiveExplanation[];
  explanationSource?: 'ai' | 'cached' | 'deterministic';
  enabled: boolean;
  tickSeconds: number;
  computedAt: string;
  matrixSource: string;
  approximate: boolean;
  cached: boolean;
  routes: LiveRouteProposal[];
  moves: LiveMove[];
  scoreBefore: LiveScore | null;
  scoreAfter: LiveScore | null;
  savedMinutes: number;
  changed: boolean;
  skippedRoutes: Array<{ routeId: string; reason: string }>;
  computeMs?: number;
}

const MIN_APPLY_GAIN_MINUTES = 0.2;

/** A pure re-ordering: the route keeps its stops, so the existing «recalculate» can apply it. */
export function isReorderOnly(route: LiveRouteProposal): boolean {
  return route.changed && route.movedIn.length === 0 && route.movedOut.length === 0;
}

export function appliableRoutes(proposal: LiveProposal | null): LiveRouteProposal[] {
  return (proposal?.routes ?? []).filter(
    (route) => isReorderOnly(route) && route.savedMinutes >= MIN_APPLY_GAIN_MINUTES,
  );
}

/** Stops whose position changes, or that change courier: they pulse on the map. */
export function changedStopIds(proposal: LiveProposal | null): Set<string> {
  const ids = new Set<string>();
  for (const route of proposal?.routes ?? []) {
    if (!route.changed) continue;
    route.proposedOrder.forEach((stopId, index) => {
      if (route.currentOrder[index] !== stopId) ids.add(stopId);
    });
  }
  return ids;
}

/** A short key that changes only when the proposal itself changes (not on every tick). */
export function proposalSignature(proposal: LiveProposal | null): string {
  if (!proposal) return '';
  return JSON.stringify(
    proposal.routes.filter((r) => r.changed).map((r) => [r.routeId, r.proposedOrder]),
  );
}

export function secondsUntil(nextAt: number, now: number): number {
  return Math.max(0, Math.ceil((nextAt - now) / 1000));
}
