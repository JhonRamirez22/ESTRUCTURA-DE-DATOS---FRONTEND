import { describe, expect, it } from 'vitest';
import {
  Spring,
  constrainDrag,
  dampingForRelease,
  isAtRest,
  nearestSnap,
  project,
  releaseVelocity,
  rubberband,
  stepSpring,
} from '@/lib/spring';

function simulate(target: number, response: number, damping: number, velocity = 0, seconds = 3) {
  let state = { value: 0, velocity };
  const trail: number[] = [];
  for (let frame = 0; frame < seconds * 60; frame += 1) {
    state = stepSpring(state, target, 1 / 60, response, damping);
    trail.push(state.value);
  }
  return { state, trail };
}

describe('resorte', () => {
  it('amortiguamiento 1 llega al destino sin sobrepasarlo', () => {
    const { state, trail } = simulate(100, 0.4, 1);
    expect(Math.max(...trail)).toBeLessThanOrEqual(100.0001);
    expect(isAtRest(state, 100)).toBe(true);
  });

  it('amortiguamiento menor que 1 rebota y luego se asienta', () => {
    const { state, trail } = simulate(100, 0.4, 0.8);
    expect(Math.max(...trail)).toBeGreaterThan(100);
    expect(isAtRest(state, 100)).toBe(true);
  });

  it('una velocidad inicial hacia el destino lo alcanza antes', () => {
    const slow = simulate(100, 0.4, 1).trail[8]!;
    const fast = simulate(100, 0.4, 1, 1500).trail[8]!;
    expect(fast).toBeGreaterThan(slow);
  });

