import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StaffPage from '@/app/personal/page';

vi.mock('@/components/PasswordChangeForm', () => ({ default: () => null }));
vi.mock('@/components/DemoGpsButton', () => ({ default: () => null }));
vi.mock('next/navigation', () => ({ usePathname: () => '/personal' }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockApi() {
  const team = [
    { id: 'c1', name: 'Laura Pérez', phone: '3001112233', status: 'OFFLINE', lastLocationAt: null },
    { id: 'c-history', name: 'Andrés Rosero', phone: '3002223344', status: 'OFFLINE', lastLocationAt: null },
  ];
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path.endsWith('/auth/session')) {
      return Response.json({ authenticated: true }, { headers: { 'X-CSRF-Token': 'proof' } });
    }
    if (init?.method === 'DELETE') {
      const id = path.split('/').pop();
      if (id === 'c-history') return Response.json({ error: 'Con rutas.' }, { status: 409 });
      const index = team.findIndex((item) => item.id === id);
      if (index >= 0) team.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/repartidores') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string; phone: string };
      team.push({ id: 'c2', name: body.name, phone: body.phone, status: 'OFFLINE', lastLocationAt: null });
