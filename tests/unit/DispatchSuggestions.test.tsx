import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import DispatchSuggestions from '@/components/DispatchSuggestions';

const payload = {
  enabled: true,
  suggestions: [
    { id: 'idle_courier:c1', kind: 'idle_courier', severity: 'action', text: 'Ana está libre y tiene 2 pedidos cerca.', source: 'deterministic', action: { type: 'select', label: 'x', deliveryPointIds: ['p1', 'p2'] } },
    { id: 'stale_gps:c2', kind: 'stale_gps', severity: 'warning', text: 'Beto no envía ubicación hace 14 min.', source: 'groq-validated', action: null },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('muestra los avisos y la acción de un clic selecciona los pedidos', async () => {
  const onSelect = vi.fn();
  render(<DispatchSuggestions onSelect={onSelect} refreshKey={0} />);
  expect(await screen.findByText(/Ana está libre/)).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Seleccionar pedidos/i })); });
  expect(onSelect).toHaveBeenCalledWith(['p1', 'p2']);
  expect(screen.queryByText(/Ana está libre/)).toBeNull();
});

test('un aviso sin acción solo se puede descartar y un fallo de red no rompe nada', async () => {
  render(<DispatchSuggestions onSelect={vi.fn()} refreshKey={0} />);
  await screen.findByText(/Beto no envía/);
  expect(screen.getAllByRole('button', { name: /Descartar aviso/i }).length).toBe(2);
  cleanup();
