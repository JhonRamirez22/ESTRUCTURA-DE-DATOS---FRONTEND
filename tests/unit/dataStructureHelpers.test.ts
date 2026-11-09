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
    expect(cache.get('k')).toBe('nuevo');
    now = 151;
    expect(cache.get('k')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('rechaza una capacidad inválida', () => {
    expect(() => new LruCache(0, 10)).toThrow();
  });
});

describe('nearestStopsByEta', () => {
  it('devuelve las paradas con menor ETA y descarta valores inválidos', () => {
    const result = nearestStopsByEta(
      [
        { stopId: 'c', estimatedMinutesFromNow: 30 },
        { stopId: 'a', estimatedMinutesFromNow: 5 },
        { stopId: 'x', estimatedMinutesFromNow: Number.NaN },
        { stopId: 'b', estimatedMinutesFromNow: 12 },
      ],
      2,
    );
    expect(result.map((item) => item.stopId)).toEqual(['a', 'b']);
    expect(nearestStopsByEta([], 3)).toEqual([]);
  });
});

describe('OfflineQueue', () => {
  it('reenvía en orden FIFO y se detiene en el primer fallo sin perder acciones', async () => {
    const queue = new OfflineQueue<string>();
    ['uno', 'dos', 'tres'].forEach((item) => queue.enqueue(item));
    const sent: string[] = [];
    let failedOnce = false;
    const flaky = async (item: string) => {
      if (item === 'dos' && !failedOnce) {
        failedOnce = true;
        throw new Error('sin red');
      }
      sent.push(item);
    };
    expect(await queue.flush(flaky)).toBe(1);
    expect(queue.size).toBe(2);
    expect(await queue.flush(flaky)).toBe(2);
    expect(sent).toEqual(['uno', 'dos', 'tres']);
    expect(queue.size).toBe(0);
  });
});
