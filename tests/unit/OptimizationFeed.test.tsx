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
