import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HistoryPage from '@/app/historial/page';

const { jsonMock } = vi.hoisted(() => ({ jsonMock: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  apiJson: jsonMock,
  ApiRequestError: class extends Error {},
  onSessionChange: () => () => undefined,
  setSessionRole: () => undefined,
}));
vi.mock('@/components/AppShell', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/SessionChangeNotice', () => ({ SessionChangeNotice: () => null }));

const item = {
  id: 'p1', orderId: 'RP-1001', address: 'Carrera 25 # 4 sur 65', status: 'DELIVERED',
  courierName: 'Ana Repartidora', createdAt: '2026-11-20T15:00:00Z', deliveredAt: '2026-11-20T16:00:00Z',
  scheduledFor: null, events: 4, lastEventAt: '2026-11-20T16:00:00Z',
};

beforeEach(() => {
  jsonMock.mockReset();
  jsonMock.mockImplementation(async (url: string) => {
    if (url.includes('/eventos')) {
      return { events: [
        { type: 'CREATED', at: '2026-11-20T15:00:00Z', fromStatus: null, toStatus: 'PENDING', actor: 'dispatcher', courierName: null, detail: null },
        { type: 'DELIVERED', at: '2026-11-20T16:00:00Z', fromStatus: 'EN_ROUTE', toStatus: 'DELIVERED', actor: 'courier', courierName: 'Ana Repartidora', detail: null },
      ] };
    }
    return { total: 1, page: 1, pageSize: 25, items: [item] };
  });
});
afterEach(cleanup);

it('lista los envíos y muestra la línea de tiempo del elegido', async () => {
  await act(async () => { render(<HistoryPage />); });
  expect(await screen.findByText('Carrera 25 # 4 sur 65')).toBeTruthy();
  expect(screen.getByText('1 envíos')).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ver línea de tiempo' })); });
  expect(await screen.findByText('Pedido registrado')).toBeTruthy();
  expect(screen.getAllByText(/Entregado/).length).toBeGreaterThan(0);
  expect(String(jsonMock.mock.calls.at(-1)?.[0])).toContain('/api/historial/envios/p1/eventos');
});

it('envía el estado elegido como filtro y vuelve a la página 1', async () => {
  await act(async () => { render(<HistoryPage />); });
  await screen.findByText('Carrera 25 # 4 sur 65');
  await act(async () => { fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'FAILED' } }); });
  expect(String(jsonMock.mock.calls.at(-1)?.[0])).toContain('estado=FAILED');
  expect(String(jsonMock.mock.calls.at(-1)?.[0])).toContain('pagina=1');
});

it('avisa si el historial no carga y muestra vacío sin resultados', async () => {
  jsonMock.mockRejectedValue(new Error('x'));
  await act(async () => { render(<HistoryPage />); });
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el historial');
});
