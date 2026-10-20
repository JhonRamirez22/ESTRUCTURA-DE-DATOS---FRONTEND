import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RepartidorPage from '@/app/repartidor/page';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: request }));
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

it('no optimiza al abrir ni navegar; solo recalcula la ruta asignada al pulsar y actualiza mapa/lista', async () => {
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
        trafficAi: { source: 'external-ai', applied: true },
        liveTraffic: { applied: true, usedMeasuredSegments: 1 },
      });
    if (url.endsWith('/navegacion')) return Response.json({ navigation: null });
    if (url === '/api/rutas') return Response.json({ routes: [route] });
    return Response.json({
      courier: {
        status: 'AVAILABLE',
        currentLat: null,
        currentLng: null,
        lastLocationAt: null,
      },
    });
  });
  await act(async () => render(<RepartidorPage />));
  expect(request.mock.calls.some(([url]) => String(url).endsWith('/recalcular'))).toBe(false);
  expect(screen.getByTestId('courier-map').textContent).toBe('first,second');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Optimizar con tráfico e IA' }))
  );
  expect(request).toHaveBeenCalledWith(
    '/api/rutas/assigned/recalcular',
    expect.objectContaining({ method: 'POST', body: '{}' })
  );
  expect(screen.getByTestId('courier-map').textContent).toBe('second,first');
  expect(screen.getAllByRole('listitem')[0].textContent).toContain('Dirección second');
  expect(screen.getByText(/TomTom: 1 tramos/)).toBeTruthy();
});

it('sin ruta asignada no ofrece optimización ni crea recorridos', async () => {
  vi.stubGlobal('localStorage', { removeItem: vi.fn() });
  request.mockReset();
  request.mockImplementation(async (url: string) =>
    Response.json(url === '/api/rutas' ? { routes: [] } : {
      courier: { status: 'AVAILABLE', currentLat: null, currentLng: null, lastLocationAt: null },
    })
  );
  await act(async () => render(<RepartidorPage />));
  expect(screen.queryByRole('button', { name: 'Optimizar con tráfico e IA' })).toBeNull();
  expect(screen.queryByTestId('courier-map')).toBeNull();
  expect(request.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});
