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
