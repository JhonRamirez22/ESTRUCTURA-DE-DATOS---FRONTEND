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
