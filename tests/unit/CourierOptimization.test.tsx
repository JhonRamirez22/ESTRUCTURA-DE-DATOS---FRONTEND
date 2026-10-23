import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RepartidorPage from '@/app/repartidor/page';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({
  apiFetch: request,
  onSessionChange: () => () => undefined,
  setSessionRole: () => undefined,
}));
vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('next/dynamic', () => ({
  default:
    () =>
    ({ route }: { route: { deliveryPoints: { id: string }[] } }) => (
      <div data-testid="courier-map">{route.deliveryPoints.map((point) => point.id).join(',')}</div>
    ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('revisa cada 5 s y aplica sola una mejora real, mostrando el ahorro y las mejoras acumuladas', async () => {
  request.mockReset();
  vi.stubGlobal('localStorage', { removeItem: vi.fn() });
  const points = ['first', 'second'].map((id, sequenceIndex) => ({
    id,
    sequenceIndex,
    address: `Dirección ${id}`,
    lat: 1.21,
