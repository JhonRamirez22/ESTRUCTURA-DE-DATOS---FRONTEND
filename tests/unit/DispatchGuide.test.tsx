import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DispatchAction, DispatchSteps } from '@/components/DispatchGuide';
import { dispatchFlow, type DispatchFlowInput } from '@/lib/dispatchFlow';

afterEach(cleanup);

const base: DispatchFlowInput = {
  pendingCount: 14, selectedOrders: 14, availableCouriers: 4, selectedCouriers: 4,
  analyzing: false, dispatching: false, hasProposal: false, proposalIsCurrent: false,
};
const counts = { orders: 14, couriers: 4, pending: 14, availableCouriers: 4 };

it('listo para analizar: el botón dice qué hará y avisa que aún no se envía nada', () => {
  const onAct = vi.fn();
  render(<DispatchAction counts={counts} flow={dispatchFlow(base)} onAct={onAct} onBack={vi.fn()} />);
  const button = screen.getByRole('button', { name: 'Analizar reparto · 14 pedidos · 4 repartidores' });
  expect(button).toBeEnabled();
  expect(screen.getByRole('status').textContent).toContain('todavía no se envía nada');
  fireEvent.click(button);
  expect(onAct).toHaveBeenCalledTimes(1);
});

it('sin repartidores con GPS el botón está bloqueado y dice por qué', () => {
  render(<DispatchAction counts={{ ...counts, couriers: 0, availableCouriers: 0 }} flow={dispatchFlow({ ...base, availableCouriers: 0, selectedCouriers: 0 })} onAct={vi.fn()} onBack={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Ningún repartidor disponible' })).toBeDisabled();
  expect(screen.getByRole('status').textContent).toContain('GPS');
});

it('con propuesta vigente despacha lo propuesto y deja cambiar la selección', () => {
  const onAct = vi.fn();
  const onBack = vi.fn();
  render(<DispatchAction counts={{ ...counts, orders: 1, couriers: 1 }} flow={dispatchFlow({ ...base, hasProposal: true, proposalIsCurrent: true })} onAct={onAct} onBack={onBack} />);
  fireEvent.click(screen.getByRole('button', { name: 'Despachar 1 pedido a 1 repartidor' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar la selección' }));
  expect(onAct).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
});

it('si la selección cambió pide analizar de nuevo y no despacha', () => {
  render(<DispatchAction counts={counts} flow={dispatchFlow({ ...base, hasProposal: true, proposalIsCurrent: false })} onAct={vi.fn()} onBack={vi.fn()} />);
