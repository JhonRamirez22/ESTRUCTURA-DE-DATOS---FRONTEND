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
    const first = assigner.assign(['a', 'b', 'c']);
    expect(new Set(Object.values(first)).size).toBe(3);
    const later = assigner.assign(['a', 'c']);
    expect(later.a).toBe(first.a);
    expect(later.c).toBe(first.c);
    const withNew = assigner.assign(['a', 'c', 'd']);
    expect(withNew.a).toBe(first.a);
    expect(withNew.d).toBe(first.b); // the freed colour is reused, nobody else changes
  });

  it('keeps working with more routes than colours', () => {
    const ids = Array.from({ length: ROUTE_PALETTE.length + 3 }, (_, i) => `r${i}`);
    const colours = new RouteColorAssigner().assign(ids);
    expect(Object.keys(colours)).toHaveLength(ids.length);
    expect(Object.values(colours).every((c) => ROUTE_PALETTE.includes(c as never))).toBe(true);
  });
});

describe('liveOptimization helpers', () => {
  it('separates pure re-orderings from stop moves and tiny gains', () => {
    const reorder = route({ changed: true, proposedOrder: ['a', 'c', 'b'], savedMinutes: 2 });
    const move = route({ routeId: 'r2', changed: true, movedIn: ['x'], savedMinutes: 3 });
    const tiny = route({ routeId: 'r3', changed: true, proposedOrder: ['a', 'c', 'b'], savedMinutes: 0.1 });
    expect(isReorderOnly(reorder)).toBe(true);
    expect(isReorderOnly(move)).toBe(false);
    expect(appliableRoutes(proposal([reorder, move, tiny])).map((r) => r.routeId)).toEqual(['r1']);
    expect(appliableRoutes(null)).toEqual([]);
  });

  it('lists the stops that change position', () => {
    const changed = route({ changed: true, proposedOrder: ['a', 'c', 'b'] });
    expect([...changedStopIds(proposal([changed]))].sort()).toEqual(['b', 'c']);
    expect(changedStopIds(proposal([route({})])).size).toBe(0);
    expect(changedStopIds(null).size).toBe(0);
  });

  it('keeps the same signature while the proposal does not change', () => {
    const a = proposal([route({ changed: true, proposedOrder: ['a', 'c', 'b'], savedMinutes: 2 })]);
    const b = proposal([route({ changed: true, proposedOrder: ['a', 'c', 'b'], savedMinutes: 2.4 })]);
    expect(proposalSignature(a)).toBe(proposalSignature(b));
    expect(proposalSignature(proposal([route({})]))).toBe('[]');
    expect(proposalSignature(null)).toBe('');
  });

  it('counts down in whole seconds and never goes negative', () => {
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(10_000, 9_001)).toBe(1);
    expect(secondsUntil(10_000, 12_000)).toBe(0);
  });
});
