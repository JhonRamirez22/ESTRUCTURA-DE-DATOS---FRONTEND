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
  const live = proposal([route({ changed: true, proposedOrder: ['b', 'a'], savedMinutes: 11.2 }), route({ routeId: 'r2' })]);
  render(<LiveOptimizationHud applying={false} onApplyAll={vi.fn()} routes={routes} state={state(live)} />);
  expect(screen.getByText('Recalculando en vivo')).toBeInTheDocument();
  expect(screen.getByText(/Próximo cálculo en 7 s/)).toBeInTheDocument();
  expect(screen.getByText('Mejora posible: −31,2 min')).toBeInTheDocument();
  expect(screen.getByText('Ruta más larga 21,5 → 7 min')).toBeInTheDocument();
  expect(screen.getByText('Cruces 22 → 0')).toBeInTheDocument();
  expect(screen.getByText('−11,2 min')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Repartidores y su ruta' }).querySelectorAll('li')).toHaveLength(2);
});

it('applies every pure re-ordering at once, and not stop moves', () => {
  const onApplyAll = vi.fn();
  const live = proposal([
    route({ changed: true, proposedOrder: ['b', 'a'], savedMinutes: 4 }),
    route({ routeId: 'r2', changed: true, movedIn: ['x'], savedMinutes: 5 }),
  ], { moves: [{ stopId: 'x', fromRouteId: 'r1', toRouteId: 'r2', gainMinutes: 2 }] });
  render(<LiveOptimizationHud applying={false} onApplyAll={onApplyAll} routes={routes} state={state(live)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar 1 mejoras de orden' }));
  expect(onApplyAll).toHaveBeenCalledTimes(1);
  expect(screen.getByText('1 paradas cambiarían de repartidor (sugerencia)')).toBeInTheDocument();
});

it('says the routes are fine, warns offline and approximate data, and hides when disabled or empty', () => {
