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
    vi.useFakeTimers();
    request.mockReset();
    request.mockImplementation((path: string) =>
      Promise.resolve(
        Response.json(
          path.includes('/resolver')
            ? { candidates: [match], warning: 'Ubicación aproximada' }
            : { deliveryPoints: [] }
        )
      )
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('consulta texto tras 500ms sin exigir coordenadas y requiere confirmación', async () => {
    await act(async () => {
      render(<OrdersPage />);
    });
    fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'carrera 25 num 3' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(request.mock.calls.filter((call) => String(call[0]).includes('/resolver'))).toHaveLength(
      0
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const lookup = request.mock.calls.find((call) => String(call[0]).includes('/resolver'))!;
    expect(JSON.parse(lookup[1].body)).toEqual({ address: 'carrera 25 num 3' });
    expect(screen.getByText('Ubicación aproximada')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Confirmar ubicación/ }));
    expect(screen.getByText(/Confirmaste una ubicación aproximada/)).toBeTruthy();
  });

  it('cancela la búsqueda anterior e ignora respuestas tardías', async () => {
    let finish!: (response: Response) => void;
    request.mockImplementation((path: string) =>
      path.includes('/resolver')
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(Response.json({ deliveryPoints: [] }))
    );
    await act(async () => {
      render(<OrdersPage />);
    });
    fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Carrera 25 num 3' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    const first = request.mock.calls.find((call) => String(call[0]).includes('/resolver'))!;
    fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Calle 10' } });
    expect(first[1].signal.aborted).toBe(true);
    await act(async () => {
      finish(Response.json({ candidates: [match] }));
    });
    expect(screen.queryByRole('button', { name: /Confirmar ubicación/ })).toBeNull();
    expect((screen.getByLabelText('Dirección') as HTMLInputElement).value).toBe('Calle 10');
  });

  it('conserva el texto y permite continuar si TomTom limita solicitudes', async () => {
    request.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes('/resolver')
          ? Response.json({ detail: 'TomTom alcanzó su límite' }, { status: 429 })
          : Response.json({ deliveryPoints: [] })
      )
    );
    await act(async () => {
      render(<OrdersPage />);
    });
    fireEvent.change(screen.getByLabelText('Dirección'), { target: { value: 'Carrera 25 num 3' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByText('TomTom alcanzó su límite')).toBeTruthy();
    expect((screen.getByLabelText('Dirección') as HTMLInputElement).value).toBe('Carrera 25 num 3');
  });
});
