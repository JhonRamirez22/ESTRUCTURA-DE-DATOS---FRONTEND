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

it('propone la ruta cada 5 s sin cambiarla; solo Aplicar recalcula y actualiza mapa/lista', async () => {
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
        cached: false,
      });
    if (url.endsWith('/trafico-vivo'))
      return Response.json({ observations: [] });
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
  expect(request).toHaveBeenCalledWith(
    '/api/rutas/assigned/propuesta',
    expect.objectContaining({ method: 'POST', body: '{}' })
  );
  expect(request.mock.calls.some(([url]) => String(url).endsWith('/recalcular'))).toBe(false);
  expect(screen.getByTestId('courier-map').textContent).toBe('first,second');
  expect(screen.queryByRole('button', { name: 'Optimizar con tráfico e IA' })).toBeNull();
  expect(screen.getByText(/Ahorras unos 3 min/)).toBeTruthy();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Aplicar ruta' })));
  expect(request).toHaveBeenCalledWith(
    '/api/rutas/assigned/recalcular',
    expect.objectContaining({ method: 'POST', body: '{}' })
  );
  expect(screen.getByTestId('courier-map').textContent).toBe('second,first');
  expect(screen.getAllByRole('listitem')[0].textContent).toContain('Dirección second');
  expect(screen.getByText(/Ruta optimizada aplicada/)).toBeTruthy();
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
