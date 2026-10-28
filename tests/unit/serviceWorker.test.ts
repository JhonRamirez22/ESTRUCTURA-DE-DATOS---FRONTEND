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

