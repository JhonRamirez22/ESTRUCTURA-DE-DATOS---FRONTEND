import { describe, expect, it } from 'vitest';
import {
  appliableRoutes,
  changedStopIds,
  isReorderOnly,
  proposalSignature,
  secondsUntil,
  type LiveProposal,
  type LiveRouteProposal,
} from '@/lib/liveOptimization';
import { ROUTE_PALETTE, RouteColorAssigner } from '@/lib/routeColors';

const route = (patch: Partial<LiveRouteProposal>): LiveRouteProposal => ({
  routeId: 'r1', changed: false, currentOrder: ['a', 'b', 'c'], proposedOrder: ['a', 'b', 'c'],
  movedIn: [], movedOut: [], currentMinutes: 10, proposedMinutes: 10, savedMinutes: 0, geometry: null,
  ...patch,
});
const proposal = (routes: LiveRouteProposal[]): LiveProposal => ({
  enabled: true, tickSeconds: 10, computedAt: '', matrixSource: 'osrm', approximate: false,
  cached: false, routes, moves: [], scoreBefore: null, scoreAfter: null, savedMinutes: 0,
  changed: routes.some((r) => r.changed), skippedRoutes: [],
});

describe('RouteColorAssigner', () => {
  it('gives each route its own colour and keeps it while the route exists', () => {
    const assigner = new RouteColorAssigner();
