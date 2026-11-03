import { describe, expect, it } from 'vitest';
import { getPastoMinimumZoom } from '@/lib/mapViewport';

describe('límites del viewport de Pasto', () => {
  it('adapta el zoom mínimo a móvil y escritorio', () => {
    const mobile = getPastoMinimumZoom(320, 400);
    const desktop = getPastoMinimumZoom(1200, 600);
    expect(mobile).toBeGreaterThan(11);
    expect(desktop).toBeGreaterThan(mobile);
    expect(desktop).toBeLessThan(18);
  });
  it('maneja canvas sin tamaño, valores inválidos y viewport extremo', () => {
    expect(getPastoMinimumZoom(0, 0)).toBe(11);
    expect(getPastoMinimumZoom(NaN, 600)).toBe(11);
    expect(getPastoMinimumZoom(1e20, 1e20)).toBe(18);
  });
});
