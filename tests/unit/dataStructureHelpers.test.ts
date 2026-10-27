import { describe, expect, it } from 'vitest';
import { nearestStopsByEta } from '@/lib/etaHeap';
import { LruCache } from '@/lib/lruCache';
import { OfflineQueue } from '@/lib/offlineQueue';

describe('LruCache', () => {
  it('expulsa la entrada menos usada y respeta el orden de uso', () => {
    const cache = new LruCache<string, number>(2, 1_000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a pasa al frente
    cache.set('c', 3); // expulsa b
    expect(cache.get('b')).toBeUndefined();
    expect(cache.keys()).toEqual(['c', 'a']);
  });

  it('descarta entradas vencidas y permite reemplazar una clave', () => {
    let now = 0;
    const cache = new LruCache<string, string>(3, 100, () => now);
    cache.set('k', 'viejo');
    now = 50;
    cache.set('k', 'nuevo');
    expect(cache.size).toBe(1);
    now = 149;
