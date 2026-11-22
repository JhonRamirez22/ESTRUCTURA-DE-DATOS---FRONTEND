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
  expect(screen.getByRole('list', { name: 'Repartidores y su ruta' }).querySelectorAll('li')).toHaveLength(3); // 2 repartidores + «Siguiente punto»
  expect(screen.getByText('Siguiente punto')).toBeInTheDocument();
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
  const calm = proposal([route({})], { changed: false });
  const { rerender } = render(<LiveOptimizationHud applying={false} onApplyAll={vi.fn()} routes={routes} state={state(calm)} />);
  expect(screen.getByText(/Las rutas ya están bien ordenadas/)).toBeInTheDocument();
  rerender(<LiveOptimizationHud applying={false} onApplyAll={vi.fn()} routes={routes} state={state(proposal([route({})], { approximate: true }), { status: 'error' })} />);
  expect(screen.getByText('Sin conexión: se conserva el último cálculo')).toBeInTheDocument();
  expect(screen.getByText('Tiempos aproximados: sin datos de calles')).toBeInTheDocument();
  rerender(<LiveOptimizationHud applying={false} onApplyAll={vi.fn()} routes={routes} state={state(null, { status: 'disabled' })} />);
  expect(screen.queryByText('Recalculando en vivo')).toBeNull();
  rerender(<LiveOptimizationHud applying={false} onApplyAll={vi.fn()} routes={[]} state={state(calm)} />);
  expect(screen.queryByText('Recalculando en vivo')).toBeNull();
});

it('a route card offers the new order only for a real re-ordering', () => {
  const onApply = vi.fn();
  const { rerender } = render(<LiveRouteSuggestion applying={false} onApply={onApply} proposal={route({ changed: true, proposedOrder: ['b', 'a'], savedMinutes: 3.4, currentMinutes: 12, proposedMinutes: 8.6 })} />);
  expect(screen.getByText('Nuevo orden: −3,4 min (de 12 a 8,6 min)')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar el nuevo orden' }));
  expect(onApply).toHaveBeenCalledTimes(1);
  rerender(<LiveRouteSuggestion applying={false} onApply={onApply} proposal={route({ changed: true, movedOut: ['x'], savedMinutes: 2 })} />);
  expect(screen.queryByRole('button', { name: 'Aplicar el nuevo orden' })).toBeNull();
  expect(screen.getByText(/Se sugiere mover 1 parada\(s\) entre repartidores/)).toBeInTheDocument();
  rerender(<LiveRouteSuggestion applying={false} onApply={onApply} proposal={route({})} />);
  expect(screen.getByText(/Ya es la mejor con el tráfico de ahora/)).toBeInTheDocument();
});

it('muestra el siguiente punto y el porqué con nombres locales, y marca lo escrito por IA', () => {
  const live = proposal([route({ changed: false })]);
  live.focusRouteId = 'a';
  live.explanationSource = 'ai';
  live.explanations = [
    { id: 'next:a', kind: 'next', source: 'deterministic', text: '{route} va primero a {stop} (a unos 2,0 min).',
      routeId: 'a', stopId: 's1', fromRouteId: null, toRouteId: null },
    { id: 'move:s2', kind: 'move', source: 'groq-validated', text: '{stop} pasa de {from} a {to} y ahorra 3,2 min.',
      routeId: null, stopId: 's2', fromRouteId: 'a', toRouteId: 'b' },
  ];
  render(
    <LiveOptimizationHud
      applying={false}
      onApplyAll={() => undefined}
      routes={[{ id: 'a', courierName: 'Ana', color: '#55f26b' }, { id: 'b', courierName: 'Beto', color: '#38bdf8' }]}
      state={state(live)}
      stopLabels={{ s1: 'Calle 18 # 22-14', s2: 'Carrera 25 # 17-50' }}
    />
  );
  expect(screen.getByText(/Ana va primero a Calle 18 # 22-14/)).toBeInTheDocument();
  expect(screen.getByText('Carrera 25 # 17-50 pasa de Ana a Beto y ahorra 3,2 min.')).toBeInTheDocument();
  expect(screen.getByText('IA verificada')).toBeInTheDocument();
});
