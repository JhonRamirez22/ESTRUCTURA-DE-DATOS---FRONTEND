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
  Popup: function () {
    return { setLngLat: vi.fn().mockReturnThis(), setText: vi.fn().mockReturnThis(), addTo: vi.fn().mockReturnThis(), remove: vi.fn() };
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

