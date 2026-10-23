import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LiveOptimizationHud, LiveRouteSuggestion } from '@/components/LiveOptimizationHud';
import type { LiveProposal, LiveRouteProposal } from '@/lib/liveOptimization';
import type { LiveOptimizationState } from '@/lib/useLiveOptimization';

afterEach(cleanup);

const route = (patch: Partial<LiveRouteProposal>): LiveRouteProposal => ({
  routeId: 'r1', changed: false, currentOrder: ['a', 'b'], proposedOrder: ['a', 'b'], movedIn: [], movedOut: [],
  currentMinutes: 10, proposedMinutes: 10, savedMinutes: 0, geometry: null, ...patch,
});
const proposal = (routes: LiveRouteProposal[], patch: Partial<LiveProposal> = {}): LiveProposal => ({
  enabled: true, tickSeconds: 10, computedAt: '', matrixSource: 'osrm', approximate: false, cached: false,
  routes, moves: [], scoreBefore: { totalMinutes: 48.2, longestMinutes: 21.5, balance: 1.8, crossings: 22, lowerBoundGap: 0.87 },
  scoreAfter: { totalMinutes: 17, longestMinutes: 7, balance: 1.6, crossings: 0, lowerBoundGap: 0.1 },
  savedMinutes: 31.2, changed: routes.some((r) => r.changed), skippedRoutes: [], ...patch,
});
const state = (p: LiveProposal | null, patch: Partial<LiveOptimizationState> = {}): LiveOptimizationState => ({
  proposal: p, status: p ? 'ok' : 'idle', secondsLeft: 7, computing: false, tick: 3, refresh: vi.fn(), ...patch,
});
const routes = [{ id: 'r1', courierName: 'Ana', color: '#55f26b' }, { id: 'r2', courierName: 'Beto', color: '#38bdf8' }];

it('shows the live clock, the gains and one colour per courier', () => {
