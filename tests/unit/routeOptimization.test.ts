import { describe, expect, it } from 'vitest';
import { congestionLabel, mostCongested, type TrafficPoint } from '@/lib/routeOptimization';

const point = (lng: number, multiplier: number | null, closed = false): TrafficPoint => ({
  point: [lng, 1.21],
  level: null,
  multiplier,
  closed,
  observedAt: null,
});

describe('tramos más congestionados (min-heap de tamaño k)', () => {
  it('devuelve los k peores de mayor a menor y deja fuera los fluidos', () => {
    const result = mostCongested(
      [point(-77.1, 1.05), point(-77.2, 1.9), point(-77.3, 1.3), point(-77.4, 2.4), point(-77.5, 1.6)],
      3
    );
    expect(result.map((item) => item.multiplier)).toEqual([2.4, 1.9, 1.6]);
  });

  it('un cierre supera a cualquier multiplicador y dos cierres no rompen el orden', () => {
    const result = mostCongested([point(-77.1, 3), point(-77.2, null, true), point(-77.3, null, true)], 2);
    expect(result.every((item) => item.closed)).toBe(true);
    expect(congestionLabel(result[0]!, 'cerrado')).toBe('cerrado');
  });

  it('ignora puntos repetidos y respeta k = 0', () => {
    expect(mostCongested([point(-77.2, 2), point(-77.2, 2)], 5)).toHaveLength(1);
    expect(mostCongested([point(-77.2, 2)], 0)).toEqual([]);
    expect(congestionLabel({ point: [0, 0], multiplier: 1.4, closed: false }, 'x')).toBe('+40 %');
  });
});
