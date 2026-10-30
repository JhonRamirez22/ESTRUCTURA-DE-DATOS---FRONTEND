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

