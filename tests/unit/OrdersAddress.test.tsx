import { clearResolvedAddresses } from '@/lib/addressCache';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from '@/app/pedidos/page';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: request }));
vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('next/dynamic', () => ({ default: () => () => <div>Mapa</div> }));

const match = {
  address: 'Carrera 25 # 3, Pasto',
  lat: 1.21,
  lng: -77.28,
  precision: 'approximate',
};

describe('resolución de direcciones antes de seleccionar un pin', () => {
  beforeEach(() => {
    clearResolvedAddresses();
    vi.useFakeTimers();
    request.mockReset();
    request.mockImplementation((path: string) =>
      Promise.resolve(
        Response.json(
          path.includes('/resolver')
            ? { candidates: [match], warning: 'Ubicación aproximada' }
            : { deliveryPoints: [] }
        )
