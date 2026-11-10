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

describe('solicitud pública de envío', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('exige dirección y punto en Pasto antes de enviar, y entrega la guía', async () => {
    request.mockResolvedValue(
      Response.json({ trackingGuide: 'guia-123', reference: 'SOL-ABC123', status: 'REQUESTED' }, { status: 201 })
    );
    render(<RequestDeliveryPage />);
    const submit = screen.getByRole('button', { name: 'Enviar solicitud' });

    fireEvent.change(screen.getByLabelText(/Dirección de entrega/), { target: { value: 'Calle 18 # 22-14' } });
    await act(async () => fireEvent.click(submit));
    expect(screen.getByRole('alert')).toHaveTextContent('Marca en el mapa');

    fireEvent.click(screen.getByRole('button', { name: 'Punto en Bogotá' }));
    expect(screen.getByRole('alert')).toHaveTextContent('fuera de la zona de servicio');
    expect(request).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Punto en Pasto' }));
    await act(async () => fireEvent.click(submit));
    const [path, init] = request.mock.calls[0]!;
    expect(path).toBe('/api/solicitudes');
    expect(JSON.parse(String(init.body))).toEqual({ address: 'Calle 18 # 22-14', lat: 1.2136, lng: -77.2811 });
    expect(screen.getByText('guia-123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Seguir mi pedido' })).toHaveAttribute('href', '/cliente?guia=guia-123');
  });
});

describe('la IA ayuda a deducir la dirección', () => {
  beforeEach(() => {
    request.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('sugiere direcciones tras la pausa, avisa si la IA interpretó y ubica el punto', async () => {
    request.mockResolvedValue(
      Response.json({
        candidates: [{ address: 'Calle 18 # 22-14, Pasto', lat: 1.2136, lng: -77.2811, precision: 'address' }],
        source: 'ai+tomtom',
        normalizedAddress: 'Calle 18 # 22-14',
        warning: null,
      })
    );
    render(<RequestDeliveryPage />);
    fireEvent.change(screen.getByLabelText(/Dirección de entrega/), { target: { value: 'cll 18 nro 22 14' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(599);
    });
    expect(request).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    const [path, init] = request.mock.calls[0]!;
    expect(path).toBe('/api/solicitudes/direccion');
    expect(JSON.parse(String(init.body))).toEqual({ address: 'cll 18 nro 22 14' });
    expect(screen.getByText(/La IA \(Groq\) interpretó tu texto/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Calle 18 # 22-14, Pasto/ }));
    expect(screen.getByLabelText(/Dirección de entrega/)).toHaveValue('Calle 18 # 22-14, Pasto');
    expect(screen.getByText('1.213600, -77.281100')).toBeInTheDocument();
  });
});

describe('bandeja de solicitudes del despacho', () => {
  beforeEach(() => {
    request.mockReset();
  });

  it('acepta una solicitud y recarga pendientes y solicitudes', async () => {
    let requested = [{ id: 'r1', orderId: 'SOL-ABC123', address: 'Calle 18 # 22-14', lat: 1.2136, lng: -77.2811 }];
    request.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/api/solicitudes/r1/aceptar' && init?.method === 'POST') {
        requested = [];
        return Promise.resolve(Response.json({ ok: true }));
      }
      if (path.includes('status=REQUESTED')) return Promise.resolve(Response.json({ deliveryPoints: requested }));
      return Promise.resolve(Response.json({ deliveryPoints: [] }));
    });
    await act(async () => render(<OrdersPage />));
    expect(screen.getByRole('region', { name: 'Solicitudes de clientes' })).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Aceptar solicitud/ })));
    expect(request.mock.calls.some(([path]) => path === '/api/solicitudes/r1/aceptar')).toBe(true);
    expect(screen.getByText(/aceptada: ya está en pendientes/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Solicitudes de clientes' })).toBeNull();
  });
});
