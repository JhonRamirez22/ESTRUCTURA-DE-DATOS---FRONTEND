import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapLibreRouteMap from "@/components/MapLibreRouteMap";

const { map, listeners, resizeObservers } = vi.hoisted(() => {
  const listeners = new Map<string, () => void>();
  const source = { setData: vi.fn() };
  return {
    listeners,
    resizeObservers: [] as Array<() => void>,
    map: {
      addControl: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getSource: vi.fn(() => source),
      isStyleLoaded: vi.fn(() => true),
      once: vi.fn((event: string, callback: () => void) => listeners.set(event, callback)),
      on: vi.fn((event: string, callback: () => void) => listeners.set(event, callback)),
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
}));
vi.mock("@maplibre/maplibre-gl-directions", () => ({ layersFactory: () => [] }));

const courier = { id: "courier-1", name: "Repartidor", currentLat: 1.22, currentLng: -77.28 };
const point = { id: "point-1", address: "Calle 20", lat: 1.23, lng: -77.29, sequenceIndex: null };

describe("MapLibreRouteMap camera", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
