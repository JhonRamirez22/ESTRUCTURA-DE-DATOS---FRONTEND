import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import HistoryPage from '@/app/historial/page';

const { jsonMock } = vi.hoisted(() => ({ jsonMock: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({
  apiFetch: vi.fn(),
  apiJson: jsonMock,
  ApiRequestError: class extends Error {},
  onSessionChange: () => () => undefined,
  setSessionRole: () => undefined,
}));
vi.mock('@/components/AppShell', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/SessionChangeNotice', () => ({ SessionChangeNotice: () => null }));

const item = {
  id: 'p1', orderId: 'RP-1001', address: 'Carrera 25 # 4 sur 65', status: 'DELIVERED',
  courierName: 'Ana Repartidora', createdAt: '2026-11-20T15:00:00Z', deliveredAt: '2026-11-20T16:00:00Z',
  scheduledFor: null, events: 4, lastEventAt: '2026-11-20T16:00:00Z',
