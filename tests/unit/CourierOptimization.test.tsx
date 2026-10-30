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
    lng: -77.28,
    status: 'PENDING',
  }));
  const route = {
    id: 'assigned',
    status: 'PLANNED',
    courier: { currentLat: 1.21, currentLng: -77.28 },
    geometryProvider: 'OSRM',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-77.28, 1.21],
        [-77.27, 1.22],
      ],
    },
    deliveryPoints: points,
  };
  request.mockImplementation(async (url: string) => {
    if (url.endsWith('/recalcular'))
      return Response.json({
        route: {
          ...route,
          deliveryPoints: [...points]
            .reverse()
            .map((point, sequenceIndex) => ({ ...point, sequenceIndex })),
        },
      });
    if (url.endsWith('/propuesta'))
      return Response.json({
        orderedDeliveryPointIds: ['second', 'first'],
        currentDeliveryPointIds: ['first', 'second'],
        changed: true,
        estimatedDurationMinutes: 12,
        improvementMinutes: 3.2,
        computedAt: new Date().toISOString(),
