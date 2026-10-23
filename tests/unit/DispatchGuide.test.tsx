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
