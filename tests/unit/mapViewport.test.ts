import { describe, expect, it } from 'vitest';
import { getPastoMinimumZoom } from '@/lib/mapViewport';

describe('límites del viewport de Pasto', () => {
  it('adapta el zoom mínimo a móvil y escritorio', () => {
    const mobile = getPastoMinimumZoom(320, 400);
    const desktop = getPastoMinimumZoom(1200, 600);
    expect(mobile).toBeGreaterThan(11);
    expect(desktop).toBeGreaterThan(mobile);
