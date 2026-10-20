import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import OptimizationFeed from '@/components/OptimizationFeed';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: request }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('muestra estadísticas y eventos por alias de ruta sin cambiar ninguna ruta', async () => {
  request.mockResolvedValue(
    Response.json({
      events: [
        {
          at: '2026-10-19T22:00:00Z',
          kind: 'propuesta',
          routeAlias: 'R-AB12',
          changed: true,
          improvementMinutes: 2.4,
          trafficSegments: 3,
          aiApplied: true,
          aiOrderAccepted: true,
          aiOrderSavingMinutes: 1.8,
        },
        {
          at: '2026-10-19T21:59:00Z',
          kind: 'aplicada',
          routeAlias: 'R-CD34',
          changed: true,
          improvementMinutes: null,
          trafficSegments: 0,
          aiApplied: false,
        },
      ],
      stats: { proposals: 7, cacheHits: 40, applied: 2, trafficSegments: 9, savedMinutes: 5.5 },
      summaryCooldownSeconds: 0,
    }),
  );
  await act(async () => render(<OptimizationFeed />));
  expect(request).toHaveBeenCalledWith('/api/optimizaciones/recientes', expect.any(Object));
  expect(screen.getByText('Ruta R-AB12')).toBeTruthy();
  expect(screen.getByText(/ahorro ~2\.4 min/)).toBeTruthy();
  expect(screen.getByText('Ruta R-CD34')).toBeTruthy();
  expect(screen.getByText(/verificado con Dijkstra −1\.8 min/)).toBeTruthy();
  expect(screen.getByText('7')).toBeTruthy();
  expect(screen.queryByText(/Dirección/)).toBeNull();
});
