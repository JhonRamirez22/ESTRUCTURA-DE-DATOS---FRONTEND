import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AuditPage from '@/app/auditoria/page';

const { fetchMock, jsonMock } = vi.hoisted(() => ({ fetchMock: vi.fn(), jsonMock: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({
  apiFetch: fetchMock,
  apiJson: jsonMock,
  ApiRequestError: class extends Error {},
  onSessionChange: () => () => undefined,
  setSessionRole: () => undefined,
}));
vi.mock('@/components/AppShell', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/SessionChangeNotice', () => ({ SessionChangeNotice: () => null }));

beforeEach(() => {
  fetchMock.mockReset();
  jsonMock.mockReset();
  jsonMock.mockImplementation(async (url: string) => {
    if (url.includes('/auditoria/eventos')) {
      return { events: [{ id: 'e1', orderRef: 'RP-9', type: 'DELIVERED', fromStatus: 'EN_ROUTE', toStatus: 'DELIVERED', actorRole: 'courier', detail: null, at: '2026-11-20T20:05:00Z' }], hasMore: false };
    }
    if (url.includes('/auditoria/descargas')) {
      return { downloads: [{ action: 'fleet_summary', by: 'c***@example.com', at: '2026-11-20T20:05:00Z' }] };
    }
    return { subjects: [{ id: 'c1', label: 'Ana Repartidora', detail: 'AVAILABLE' }] };
  });
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
