import { describe, expect, it } from 'vitest';
import { congestionLabel, isSevereTraffic, mostCongested, type TrafficPoint } from '@/lib/routeOptimization';

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
