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
  await flush(0);
  expect(apiJson).toHaveBeenCalledTimes(1);
  expect(result.current.status).toBe('ok');
  expect(result.current.tick).toBe(1);
  await flush(5_000);
  expect(apiJson).toHaveBeenCalledTimes(1);
  expect(result.current.secondsLeft).toBeLessThanOrEqual(5);
  await flush(5_500);
  expect(apiJson).toHaveBeenCalledTimes(2);
  expect(result.current.tick).toBe(2);
});

it('never overlaps requests and keeps the last proposal when a tick fails', async () => {
  let release!: () => void;
  apiJson.mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(payload()); }));
  const { result } = renderHook(() => useLiveOptimization(true));
  await flush(12_000);
  expect(apiJson).toHaveBeenCalledTimes(1); // still waiting: no second request
  expect(result.current.computing).toBe(true);
  await act(async () => { release(); await Promise.resolve(); });
  expect(result.current.proposal?.savedMinutes).toBe(1);
  apiJson.mockRejectedValueOnce(new Error('network'));
  await flush(600); // the overdue tick fires right away and fails
  expect(apiJson).toHaveBeenCalledTimes(2);
  expect(result.current.status).toBe('error');
  expect(result.current.proposal?.savedMinutes).toBe(1);
});

it('waits longer after a 429 and pauses while the tab is hidden', async () => {
  const { ApiRequestError } = await import('@/lib/apiClient');
  apiJson.mockRejectedValueOnce(new ApiRequestError('slow down', 'req', 429));
  renderHook(() => useLiveOptimization(true));
  await flush(0);
  await flush(20_000);
  expect(apiJson).toHaveBeenCalledTimes(1); // backing off for 30 s
  await flush(11_000);
  expect(apiJson).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  await flush(30_000);
  expect(apiJson).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  await flush(0);
  expect(apiJson).toHaveBeenCalledTimes(3);
});

it('does nothing while disabled, stops when disabled, and refresh recomputes now', async () => {
  const { result, rerender } = renderHook(({ on }) => useLiveOptimization(on), { initialProps: { on: false } });
  await flush(15_000);
  expect(apiJson).not.toHaveBeenCalled();
  rerender({ on: true });
  await flush(0);
  expect(apiJson).toHaveBeenCalledTimes(1);
  act(() => result.current.refresh());
  await flush(0);
  expect(apiJson).toHaveBeenCalledTimes(2);
  rerender({ on: false });
  await flush(30_000);
  expect(apiJson).toHaveBeenCalledTimes(2);
  expect(result.current.proposal).toBeNull();
});
