import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import DashboardPage from '@/app/dashboard/page';

vi.mock('@/components/OptimizationFeed', () => ({ default: () => null }));
vi.mock('@/components/DispatchSuggestions', () => ({ default: () => null }));
vi.mock('@/components/DemoGpsButton', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('next/dynamic', () => ({ default: () => () => <div aria-label="Mapa operativo de prueba" /> }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mockResponses(failure: string) {
  const request = vi.fn(async (url: string) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path === failure) return Response.json({ error: 'Servicio temporalmente no disponible.' }, {
      status: 503, headers: { 'X-Request-ID': '53d10816-1e6e-4bb2-b8a5-86c665350162' },
    });
    if (path.endsWith('/repartidores')) return Response.json({ couriers: [{
      id: 'courier', name: 'Repartidor disponible', phone: '3000000000', status: 'AVAILABLE',
      currentLat: 1.21, currentLng: -77.28, lastLocationAt: new Date().toISOString(),
    }] });
    if (path.endsWith('/pedidos')) return Response.json({ deliveryPoints: [{
      id: 'point', orderId: 'ORDER-1', address: 'Calle de prueba en Pasto', lat: 1.22,
      lng: -77.28, status: 'PENDING', sequenceIndex: null,
    }] });
    if (path.endsWith('/rutas')) return Response.json({ routes: [] });
    if (path.endsWith('/notificaciones')) return Response.json({ notifications: [] });
