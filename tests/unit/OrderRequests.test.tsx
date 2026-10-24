import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrdersPage from '@/app/pedidos/page';
import RequestDeliveryPage from '@/app/solicitar/page';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: request }));
vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
// El mapa simulado expone un clic dentro y otro fuera de Pasto.
vi.mock('next/dynamic', () => ({
  default: () =>
    function MockMap({ onMapClick }: { onMapClick?: (point: { lat: number; lng: number }) => void }) {
      return (
        <div>
          <button onClick={() => onMapClick?.({ lat: 1.2136, lng: -77.2811 })} type="button">
            Punto en Pasto
          </button>
          <button onClick={() => onMapClick?.({ lat: 4.711, lng: -74.07 })} type="button">
            Punto en Bogotá
          </button>
        </div>
      );
    },
}));

afterEach(() => cleanup());

