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

export interface LiveProposal {
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
