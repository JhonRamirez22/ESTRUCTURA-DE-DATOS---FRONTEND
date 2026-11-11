import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

interface ServiceWorkerEvent {
  request?: Request;
  respondWith?: (response: Promise<unknown>) => void;
  waitUntil?: (promise: Promise<unknown>) => void;
}

type ServiceWorkerListener = (event: ServiceWorkerEvent) => void;

const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

describe('service worker', () => {
  it('solo elimina cachés antiguas de Rutas Pasto', async () => {
    const { deletedCaches, listeners } = loadServiceWorker([
      'rutas-pasto-shell-v2',
      'rutas-pasto-map-v1',
      'other-app-shell-v1',
    ]);
    let activation: Promise<unknown> | undefined;

    listeners.get('activate')?.({
      waitUntil: (promise) => {
        activation = promise;
      },
    });
    await activation;

    expect(deletedCaches).toEqual(['rutas-pasto-shell-v2']);
  });

  it('deja las respuestas de API fuera de Cache Storage', () => {
    const { listeners } = loadServiceWorker([]);
    let intercepted = false;

    listeners.get('fetch')?.({
      request: new Request('https://rutas-pasto.test/api/rutas'),
      respondWith: () => {
        intercepted = true;
      },
    });

    expect(intercepted).toBe(false);
  });

  it('no guarda documentos con nonce: solo la pantalla offline estática', async () => {
    const { listeners, cachedAssets } = loadServiceWorker([]);
    let installation: Promise<unknown> | undefined;
    listeners.get('install')?.({ waitUntil: (promise) => { installation = promise; } });
    await installation;
    expect(cachedAssets).toEqual(['/offline.html']);
  });

  it('deja pasar el worker de MapLibre y los recursos externos del mapa', () => {
    const { listeners } = loadServiceWorker([]);
    const interceptedRequests = [
      new Request('https://rutas-pasto.test/_next/static/media/maplibre-gl-worker.mjs'),
      new Request('https://tiles.openfreemap.org/planet'),
    ];

    for (const request of interceptedRequests) {
      let intercepted = false;
      listeners.get('fetch')?.({ request, respondWith: () => (intercepted = true) });
      expect(intercepted).toBe(false);
    }
  });

  it('responde con un 503 válido si falla la red y no hay copia en caché', async () => {
    const { listeners } = loadServiceWorker([], async () => {
      throw new TypeError('network unavailable');
    });
    let response: Promise<Response> | undefined;

    listeners.get('fetch')?.({
      request: new Request('https://rutas-pasto.test/dashboard'),
      respondWith: (value) => {
        response = value as Promise<Response>;
      },
    });

    await expect(response).resolves.toMatchObject({ status: 503 });
  });
});

function loadServiceWorker(
  cacheNames: string[],
  fetchImpl: typeof fetch = fetch,
): {
  deletedCaches: string[];
  listeners: Map<string, ServiceWorkerListener>;
  cachedAssets: string[];
} {
  const listeners = new Map<string, ServiceWorkerListener>();
  const deletedCaches: string[] = [];
  const cachedAssets: string[] = [];

  runInNewContext(serviceWorkerSource, {
    caches: {
      delete: async (name: string) => {
        deletedCaches.push(name);
        return true;
      },
      keys: async () => cacheNames,
      match: async () => undefined,
      open: async () => ({ add: async (asset: string) => { cachedAssets.push(asset); } }),
    },
    fetch: fetchImpl,
    Response,
    self: {
      addEventListener: (name: string, listener: ServiceWorkerListener) => {
        listeners.set(name, listener);
      },
      clients: { claim: async () => undefined },
      location: { origin: 'https://rutas-pasto.test' },
      skipWaiting: async () => undefined,
    },
    URL,
  });

  return { deletedCaches, listeners, cachedAssets };
}
