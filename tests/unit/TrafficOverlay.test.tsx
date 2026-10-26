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

