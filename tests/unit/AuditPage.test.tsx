import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuditPage from '@/app/auditoria/page';

const { fetchMock, jsonMock } = vi.hoisted(() => ({ fetchMock: vi.fn(), jsonMock: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({
  apiFetch: fetchMock,
  apiJson: jsonMock,
  ApiRequestError: class extends Error {},
  onSessionChange: () => () => undefined,
  setSessionRole: () => undefined,
}));
vi.mock('@/components/AppShell', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/SessionChangeNotice', () => ({ SessionChangeNotice: () => null }));

beforeEach(() => {
  fetchMock.mockReset();
  jsonMock.mockReset();
  jsonMock.mockImplementation(async (url: string) => {
    if (url.includes('/auditoria/eventos')) {
      return { events: [{ id: 'e1', orderRef: 'RP-9', type: 'DELIVERED', fromStatus: 'EN_ROUTE', toStatus: 'DELIVERED', actorRole: 'courier', detail: null, at: '2026-11-20T20:05:00Z' }], hasMore: false };
    }
    if (url.includes('/auditoria/descargas')) {
      return { downloads: [{ action: 'fleet_summary', by: 'c***@example.com', at: '2026-11-20T20:05:00Z' }] };
    }
    return { subjects: [{ id: 'c1', label: 'Ana Repartidora', detail: 'AVAILABLE' }] };
  });
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});
afterEach(cleanup);

it('no deja descargar hasta elegir sujeto y descarga el PDF pedido con el periodo', async () => {
  fetchMock.mockResolvedValue(
    new Response('%PDF-1.4', { status: 200, headers: { 'content-disposition': 'attachment; filename="auditoria-courier-20261120.pdf"' } }),
  );
  await act(async () => { render(<AuditPage />); });
  const button = screen.getByRole('button', { name: 'Descargar PDF' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  const pick = await screen.findByRole('button', { name: 'Elegir' });
  await act(async () => { fireEvent.click(pick); });
  expect(button.disabled).toBe(false);
  await act(async () => { fireEvent.click(button); });
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).toContain('/api/auditoria/informe?tipo=courier&id=c1');
  expect(url).toMatch(/desde=\d{4}-\d{2}-\d{2}&hasta=\d{4}-\d{2}-\d{2}/);
  expect(screen.getByRole('status').textContent).toContain('descargado');
});

it('bloquea el botón con un periodo invertido y muestra el error del servidor', async () => {
  await act(async () => { render(<AuditPage />); });
  const pick = await screen.findByRole('button', { name: 'Elegir' });
  await act(async () => { fireEvent.click(pick); });
  fireEvent.change(screen.getAllByLabelText('Desde')[0], { target: { value: '2026-12-01' } });
  fireEvent.change(screen.getAllByLabelText('Hasta')[0], { target: { value: '2026-11-01' } });
  expect((screen.getByRole('button', { name: 'Descargar PDF' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('posterior');

  fireEvent.change(screen.getAllByLabelText('Desde')[0], { target: { value: '2026-11-01' } });
  fireEvent.change(screen.getAllByLabelText('Hasta')[0], { target: { value: '2026-11-20' } });
  fetchMock.mockResolvedValue(Response.json({ error: 'El sujeto no existe.' }, { status: 404 }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' })); });
  expect(screen.getByRole('alert').textContent).toContain('El sujeto no existe.');
});

it('muestra aviso claro ante demasiados informes seguidos (429)', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: 'x' }, { status: 429 }));
  await act(async () => { render(<AuditPage />); });
  const pick = await screen.findByRole('button', { name: 'Elegir' });
  await act(async () => { fireEvent.click(pick); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' })); });
  expect(screen.getByRole('alert').textContent).toContain('Demasiados informes');
});


it('descarga un informe general con el tipo y el periodo, y lista bitácora y descargas', async () => {
  fetchMock.mockResolvedValue(
    new Response('%PDF-1.4', { status: 200, headers: { 'content-disposition': 'attachment; filename="informe-resumen-20261120.pdf"' } }),
  );
  await act(async () => { render(<AuditPage />); });
  expect(await screen.findByText(/RP-9/)).toBeTruthy();
  expect(screen.getByText(/fleet_summary/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Tipo de sujeto', { selector: 'select' }), { target: { value: 'couriers' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descargar informe' })); });
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).toContain('/api/auditoria/informe-general?tipo=couriers');
});
