import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DemoGpsButton from '@/components/DemoGpsButton';
import PasswordChangeForm from '@/components/PasswordChangeForm';
import RouteImprovementCheck from '@/components/RouteImprovementCheck';
import { orderBadges } from '@/lib/orderBadges';

const { fetchMock, jsonMock } = vi.hoisted(() => ({ fetchMock: vi.fn(), jsonMock: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: fetchMock, apiJson: jsonMock, ApiRequestError: class extends Error {} }));

beforeEach(() => { fetchMock.mockReset(); jsonMock.mockReset(); });
afterEach(cleanup);

it('el botón de GPS demo no aparece sin modo demo y renueva con él', async () => {
  jsonMock.mockResolvedValue({ enabled: false });
  const { container } = render(<DemoGpsButton />);
  await act(async () => { await Promise.resolve(); });
  expect(container.textContent).toBe('');
  cleanup();

  jsonMock.mockResolvedValue({ enabled: true });
  fetchMock.mockResolvedValue(Response.json({ renewed: 4 }));
  const onRenewed = vi.fn();
  render(<DemoGpsButton onRenewed={onRenewed} />);
  const button = await screen.findByRole('button', { name: 'Renovar GPS demo' });
  await act(async () => { fireEvent.click(button); });
  expect(fetchMock.mock.calls[0][0]).toBe('/api/demo/renovar-gps');
  expect(screen.getByRole('status').textContent).toContain('4 repartidores demo');
  expect(onRenewed).toHaveBeenCalled();
});

it('cambiar contraseña valida en pantalla y envía solo cuando todo cuadra', async () => {
  fetchMock.mockResolvedValue(Response.json({ ok: true, reloginRequired: true }));
  const onChanged = vi.fn();
  render(<PasswordChangeForm onChanged={onChanged} />);
  const save = screen.getByRole('button', { name: 'Cambiar contraseña' });
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'vieja-contraseña-2026' } });
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'corta' } });
  expect(screen.getByRole('alert').textContent).toContain('al menos 15');
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'una-contraseña-nueva-2027' } });
  fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), { target: { value: 'otra-distinta-contraseña' } });
  expect(screen.getByRole('alert').textContent).toContain('no coinciden');
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), { target: { value: 'una-contraseña-nueva-2027' } });
  expect(save).toBeEnabled();
  await act(async () => { fireEvent.click(save); });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/auth/password');
  expect(JSON.parse(init.body)).toEqual({ currentPassword: 'vieja-contraseña-2026', newPassword: 'una-contraseña-nueva-2027' });
  expect(onChanged).toHaveBeenCalled();
});

it('muestra el error del servidor si la contraseña actual es incorrecta', async () => {
  fetchMock.mockResolvedValue(Response.json({ error: 'La contraseña actual no es correcta.' }, { status: 403 }));
  const onChanged = vi.fn();
  render(<PasswordChangeForm onChanged={onChanged} />);
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'equivocada' } });
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: 'una-contraseña-nueva-2027' } });
  fireEvent.change(screen.getByLabelText('Repite la contraseña nueva'), { target: { value: 'una-contraseña-nueva-2027' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' })); });
  expect(screen.getByRole('alert').textContent).toContain('no es correcta');
  expect(onChanged).not.toHaveBeenCalled();
});

it('la propuesta de mejora solo se aplica si el despachador acepta', async () => {
  const onApply = vi.fn().mockResolvedValue(undefined);
  fetchMock.mockResolvedValue(Response.json({ changed: true, worthApplying: true, improvementMinutes: 4.2, baselineDurationMinutes: 30, estimatedDurationMinutes: 26 }));
  render(<RouteImprovementCheck canCheck onApply={onApply} routeId="r1" />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Buscar una mejor ruta' })); });
  expect(fetchMock.mock.calls[0][0]).toBe('/api/rutas/r1/propuesta');
  expect(screen.getByText(/Ahorrarías unos 4 min/)).toBeTruthy();
  expect(screen.getByText('De 30 a 26 min.')).toBeTruthy();
  expect(onApply).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Aplicar el nuevo orden' })); });
  expect(onApply).toHaveBeenCalledWith('r1');
});

it('si no hay mejora lo dice, y «Ahora no» la descarta sin aplicar', async () => {
  const onApply = vi.fn();
  fetchMock.mockResolvedValueOnce(Response.json({ changed: false, worthApplying: false, improvementMinutes: 0, estimatedDurationMinutes: 20 }));
  const { unmount } = render(<RouteImprovementCheck canCheck onApply={onApply} routeId="r1" />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Buscar una mejor ruta' })); });
  expect(screen.getByRole('status').textContent).toContain('ya es la mejor');
  unmount();
  fetchMock.mockResolvedValueOnce(Response.json({ changed: true, worthApplying: true, improvementMinutes: 3, estimatedDurationMinutes: 20 }));
  render(<RouteImprovementCheck canCheck onApply={onApply} routeId="r2" />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Buscar una mejor ruta' })); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ahora no' })); });
  expect(onApply).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Aplicar el nuevo orden' })).toBeNull();
});

it('sin GPS reciente no ofrece buscar mejoras', () => {
  const { container } = render(<RouteImprovementCheck canCheck={false} onApply={vi.fn()} routeId="r1" />);
  expect(container.textContent).toBe('');
});

it('las etiquetas del pedido muestran prioridad no normal y ventana', () => {
  const labels = { high: 'Alta', urgent: 'Urgente' };
  expect(orderBadges({ priority: 1 }, labels)).toEqual([]);
  expect(orderBadges({ priority: 3, timeWindow: { start: '09:00', end: '12:00' } }, labels)).toEqual(['Urgente', '09:00–12:00']);
  expect(orderBadges({ priority: 2, timeWindow: { end: '10:30' } }, labels)).toEqual(['Alta', '…–10:30']);
  expect(orderBadges({ timeWindow: {} }, labels)).toEqual([]);
});
