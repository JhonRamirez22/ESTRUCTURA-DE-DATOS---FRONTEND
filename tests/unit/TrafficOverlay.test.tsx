import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import TrafficOverlay, { clearTrafficCache } from '@/components/TrafficOverlay';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: request }));

function sample(cacheStatus = 'LIVE') {
  return Response.json({
    configured: true,
    available: true,
    sampledSegments: 1,
    observations: [
      {
        observedAt: new Date().toISOString(),
        cacheStatus,
        roadClosure: false,
        trafficLevel: 'ALTO',
      },
    ],
  });
}
beforeEach(() => {
  clearTrafficCache();
  vi.useFakeTimers();
  request.mockReset();
  request.mockImplementation(async () => sample());
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('consulta solo la ruta asignada, sin teselas ni capas de otras calles', async () => {
  await act(async () => render(<TrafficOverlay routeId="assigned" />));
  expect(request).toHaveBeenCalledWith(
    '/api/v1/rutas/assigned/trafico-vivo',
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(screen.getByText(/Tráfico de esta ruta/)).toBeTruthy();
  expect(screen.getByText(/1 puntos muestreados/)).toBeTruthy();
  expect(screen.getByText(/Demoras detectadas/)).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(
    request.mock.calls.some(([url]) => url.includes('/tiles/') || url.includes('/trafico/estado'))
  ).toBe(false);
});

it('refresca cada 90 segundos, solo con la pestaña visible, sin optimizar de nuevo', async () => {
  await act(async () => render(<TrafficOverlay routeId="assigned" />));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(89_999);
  });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(request).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(90_000);
  });
  expect(request).toHaveBeenCalledTimes(2);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => fireEvent(document, new Event('visibilitychange')));
  expect(request).toHaveBeenCalledTimes(3);
  expect(request.mock.calls.every(([, options]) => !options.method)).toBe(true);
