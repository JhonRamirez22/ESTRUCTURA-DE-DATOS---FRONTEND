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
