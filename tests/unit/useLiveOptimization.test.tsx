import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLiveOptimization } from '@/lib/useLiveOptimization';
import type { LiveProposal } from '@/lib/liveOptimization';

const { apiJson } = vi.hoisted(() => ({ apiJson: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({
  apiJson,
  ApiRequestError: class extends Error {
    constructor(message: string, readonly requestId: string, readonly status?: number) { super(message); }
  },
}));

const payload = (changed = true): LiveProposal => ({
  enabled: true, tickSeconds: 10, computedAt: 'now', matrixSource: 'osrm', approximate: false,
  cached: false, routes: [], moves: [], scoreBefore: null, scoreAfter: null, savedMinutes: 1,
  changed, skippedRoutes: [],
});

beforeEach(() => {
  vi.useFakeTimers();
  apiJson.mockReset();
  apiJson.mockResolvedValue(payload());
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const flush = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

it('calculates immediately and then every ten seconds', async () => {
  const { result } = renderHook(() => useLiveOptimization(true));
