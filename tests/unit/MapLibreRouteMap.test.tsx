import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapLibreRouteMap from "@/components/MapLibreRouteMap";

const { map, listeners, resizeObservers, setWorkerUrl } = vi.hoisted(() => {
  const listeners = new Map<string, (event?: unknown) => void>();
  const source = { setData: vi.fn() };
  return {
    listeners,
    resizeObservers: [] as Array<() => void>,
    setWorkerUrl: vi.fn(),
    map: {
      addControl: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getSource: vi.fn((id: string): typeof source | null => id ? source : null),
      isStyleLoaded: vi.fn(() => true),
      once: vi.fn((event: string, callback: (event?: unknown) => void) => listeners.set(event, callback)),
      on: vi.fn((event: string, callback: (event?: unknown) => void) => listeners.set(event, callback)),
      off: vi.fn(),
      remove: vi.fn(),
      resize: vi.fn(),
      setCenter: vi.fn(),
      setZoom: vi.fn(),
      setMinZoom: vi.fn(),
      fitBounds: vi.fn(),
      setStyle: vi.fn(),
    },
  };
});

vi.mock("maplibre-gl", () => ({
  Map: function () {
    return map;
  },
  NavigationControl: function () {},
  LngLatBounds: function () {
    return { extend: vi.fn() };
  },
  setWorkerUrl,
}));
vi.mock("@maplibre/maplibre-gl-directions", () => ({
  layersFactory: () => [{ id: 'plugin-alternative', type: 'line' }],
}));

const courier = { id: "courier-1", name: "Repartidor", currentLat: 1.22, currentLng: -77.28 };
const point = { id: "point-1", address: "Calle 20", lat: 1.23, lng: -77.29, sequenceIndex: null };

describe("MapLibreRouteMap camera", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    map.getSource.mockReturnValue({ setData: vi.fn() });
    map.isStyleLoaded.mockReturnValue(true);
    listeners.clear();
    resizeObservers.length = 0;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resizeObservers.push(callback);
        }
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('si el reintento también falla, permite reintentar de nuevo y no carga indefinidamente', () => {
    vi.useFakeTimers();
    map.isStyleLoaded.mockReturnValue(false);
    render(<MapLibreRouteMap couriers={[]} routes={[]} />);
    act(() => vi.advanceTimersByTime(30_000));
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar mapa' }));
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole('button', { name: 'Reintentar mapa' })).toBeTruthy();
  });

  it("configura el worker ESM de MapLibre como asset del bundler", () => {
    render(<MapLibreRouteMap couriers={[]} routes={[]} />);
    expect(setWorkerUrl).toHaveBeenCalledWith(
      expect.stringContaining("maplibre-gl-worker.mjs"),
    );
  });

  it("finaliza la carga aunque style.load llegue antes de cargar las teselas", () => {
    map.isStyleLoaded.mockReturnValueOnce(false).mockReturnValue(true);
    render(<MapLibreRouteMap couriers={[courier]} routes={[]} />);
    act(() => listeners.get("style.load")?.());
    act(() => listeners.get("idle")?.());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("no pierde un idle emitido mientras instala las capas del estilo", () => {
    map.getSource.mockReturnValue(null);
    map.addLayer.mockImplementationOnce(() => listeners.get("idle")?.());
    render(<MapLibreRouteMap couriers={[courier]} routes={[]} />);
    act(() => listeners.get("style.load")?.());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("instala las capas si el estilo terminó antes de registrar style.load", () => {
    map.getSource.mockReturnValue(null);
    map.addLayer.mockImplementationOnce(() => listeners.get("idle")?.());
    render(<MapLibreRouteMap couriers={[courier]} routes={[]} />);
    expect(map.addSource).toHaveBeenCalledWith(
      'delivery-directions',
      expect.objectContaining({ type: 'geojson' }),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("quita el overlay en el primer render sin esperar al idle de todas las teselas", () => {
    render(<MapLibreRouteMap couriers={[]} routes={[]} />);
    act(() => listeners.get("style.load")?.());
    expect(screen.getByRole("status")).toBeTruthy();
    act(() => listeners.get("render")?.());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("abandona un estilo principal no autorizado por el estilo oscuro sin clave", () => {
    render(<MapLibreRouteMap couriers={[]} routes={[]} />);
    act(() => listeners.get("error")?.({ error: { status: 403 } }));
    expect(map.setStyle).toHaveBeenCalledWith("https://tiles.openfreemap.org/styles/dark");
  });

  it("muestra recuperación manual cuando no carga el estilo de respaldo", () => {
    vi.useFakeTimers();
    map.isStyleLoaded.mockReturnValue(false);
    render(<MapLibreRouteMap couriers={[]} routes={[]} />);
    act(() => vi.advanceTimersByTime(20_000));
    const retry = screen.getByRole("button", { name: "Reintentar mapa" });
    act(() => retry.click());
    expect(map.setStyle).toHaveBeenCalledWith("https://tiles.openfreemap.org/styles/fiord");
  });

  it("preserva el zoom manual cuando el polling o el GPS actualizan los mismos puntos", () => {
    const { rerender } = render(
      <MapLibreRouteMap couriers={[courier]} routes={[]} pendingPoints={[point]} />,
    );
    act(() => listeners.get("style.load")?.());
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
    rerender(
      <MapLibreRouteMap
        couriers={[{ ...courier, currentLat: 1.221 }]}
        routes={[]}
        pendingPoints={[{ ...point }]}
      />,
    );
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("solo reencuadra ante selección explícita, no por nuevas paradas del polling", () => {
    const { rerender } = render(<MapLibreRouteMap couriers={[courier]} routes={[]} />);
    act(() => listeners.get("style.load")?.());
    expect(map.setZoom).toHaveBeenCalledTimes(1);
    rerender(<MapLibreRouteMap couriers={[courier]} routes={[]} pendingPoints={[point]} />);
    expect(map.fitBounds).not.toHaveBeenCalled();
    rerender(
      <MapLibreRouteMap
        couriers={[courier]}
        routes={[]}
        pendingPoints={[point]}
        selectedCoordinate={[1.24, -77.3]}
      />,
    );
    expect(map.fitBounds).toHaveBeenCalledTimes(1);
  });

  it("ignora posiciones fuera de Pasto y reajusta el canvas cuando cambia el panel", () => {
    render(
      <MapLibreRouteMap couriers={[{ ...courier, currentLat: 0, currentLng: 0 }]} routes={[]} />,
    );
    act(() => listeners.get("style.load")?.());
    expect(map.setCenter).not.toHaveBeenCalled();
    expect(map.fitBounds).not.toHaveBeenCalled();
    act(() => resizeObservers[0]?.());
    expect(map.resize).toHaveBeenCalled();
  });

  it('muestra un solo recorrido verde y permite cambiarlo sin alternativas ni tráfico raster', () => {
    const sources = new Map<string, NonNullable<ReturnType<typeof map.getSource>>>();
    map.getSource.mockImplementation((id: string) => sources.get(id) ?? null);
    map.addSource.mockImplementation((id: string) => sources.set(id, { setData: vi.fn() }));
    const first = {
      id: 'first', courier, deliveryPoints: [point], geometryProvider: 'OSRM' as const,
      geometry: { type: 'LineString' as const, coordinates: [[-77.28, 1.22], [-77.285, 1.225], [-77.29, 1.23]] as [number, number][] },
    };
    const second = { ...first, id: 'second', courier: { ...courier, name: 'Otro repartidor' },
      geometry: { ...first.geometry, coordinates: [[-77.28, 1.22], [-77.27, 1.23]] as [number, number][] } };
    render(<MapLibreRouteMap couriers={[courier]} routes={[first, second]} />);
    const lines = map.addLayer.mock.calls.map(([layer]) => layer).filter((layer) => layer.type === 'line');
    // Un único recorrido verde; el orden base es una comparación discontinua y no verde.
    expect(lines.map((layer) => layer.id)).toEqual([
      'route-baseline',
      'delivery-route-highlight-casing',
      'delivery-route-highlight',
    ]);
    expect(lines[2].paint['line-color']).toBe('#55f26b');
    expect(lines[0].paint['line-color']).not.toBe('#55f26b');
    expect(lines[0].paint['line-dasharray']).toBeDefined()
    const data = () => sources.get('delivery-directions')!.setData.mock.lastCall![0];
    expect(data().features).toHaveLength(1);
    expect(data().features[0].geometry.coordinates).toEqual(first.geometry.coordinates);
    fireEvent.change(screen.getByRole('combobox', { name: 'Recorrido mostrado' }), { target: { value: 'second' } });
    expect(data().features).toHaveLength(1);
    expect(data().features[0].geometry.coordinates).toEqual(second.geometry.coordinates);
    expect(map.addSource.mock.calls.some(([, source]) => source.type === 'raster')).toBe(false);
  });
});
