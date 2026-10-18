import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TrafficOverlay from '@/components/TrafficOverlay';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/lib/apiClient', () => ({ apiFetch: request }));

function fakeMap() {
  const sources = new Map();
  const layers = new Set();
  const events = new Map<string, (event?: unknown) => void>();
  return {
    sources,
    layers,
    events,
    getStyle: () => ({}),
    isStyleLoaded: () => true,
    getSource: (id: string) => sources.get(id),
    getLayer: (id: string) => layers.has(id),
    addSource: vi.fn((id: string, spec: unknown) => sources.set(id, { spec, setTiles: vi.fn() })),
    addLayer: vi.fn((layer: { id: string }) => layers.add(layer.id)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    on: vi.fn((event: string, callback: () => void) => events.set(event, callback)),
    off: vi.fn((event: string) => events.delete(event)),
  };
}

describe('capa de tráfico autenticada', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    request.mockReset();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    request.mockImplementation(() =>
      Promise.resolve(Response.json({ configured: true, observedAt: null, state: 'not-consulted' }))
    );
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('usa solo el proxy propio sin API key y permite desactivar la capa', async () => {
    const map = fakeMap();
    await act(async () => {
      render(<TrafficOverlay map={map as unknown as MapLibreMap} />);
    });
    const source = map.sources.get('rutas-pasto-traffic').spec;
    expect(source.tiles[0]).toContain('/api/v1/trafico/tiles/{z}/{x}/{y}.png');
    expect(source.tiles[0]).not.toContain('key=');
    expect(source.bounds).toEqual([-77.36, 1.16, -77.2, 1.3]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tráfico TomTom' }));
    expect(map.sources.size).toBe(0);
  });

  it('no actualiza antes de 90 segundos ni mientras la pestaña esté oculta', async () => {
    const map = fakeMap();
    await act(async () => {
      render(<TrafficOverlay map={map as unknown as MapLibreMap} />);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(89999);
    });
    expect(request).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    expect(map.sources.size).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(90001);
    });
    expect(request).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'));
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('restaura la capa tras cambiar estilo y distingue falta de cobertura', async () => {
    const map = fakeMap();
    await act(async () => {
      render(<TrafficOverlay map={map as unknown as MapLibreMap} />);
    });
    map.sources.clear();
    map.layers.clear();
    act(() => {
      map.events.get('style.load')?.();
    });
    expect(map.addSource).toHaveBeenCalledTimes(2);
    act(() => {
      map.events.get('error')?.({ sourceId: 'rutas-pasto-traffic', error: { status: 404 } });
    });
    expect(screen.getByText('Sin cobertura en esta área')).toBeTruthy();
    await act(async () => {
      map.events.get('sourcedata')?.({ sourceId: 'rutas-pasto-traffic', isSourceLoaded: true });
    });
    expect(screen.getByText('Sin cobertura en esta área')).toBeTruthy();
    expect(screen.getByText('Sin color no confirma vía libre.')).toBeTruthy();
  });

  it('muestra indisponibilidad, no vía libre, ante errores de red o cuota', async () => {
    request.mockResolvedValue(Response.json({ error: 'quota' }, { status: 429 }));
    const map = fakeMap();
    await act(async () => {
      render(<TrafficOverlay map={map as unknown as MapLibreMap} />);
    });
    expect(screen.getByText('Tráfico no disponible')).toBeTruthy();
    expect(map.addSource).not.toHaveBeenCalled();
  });
});
