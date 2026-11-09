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

  it('una velocidad contraria sale primero hacia atrás y vuelve sin saltar', () => {
    const { trail } = simulate(100, 0.4, 1, -800);
    expect(Math.min(...trail)).toBeLessThan(0);
    const largestJump = trail.slice(1).reduce((max, value, index) => Math.max(max, Math.abs(value - trail[index]!)), 0);
    expect(largestJump).toBeLessThan(60);
  });

  it('es estable con cuadros largos', () => {
    const state = stepSpring({ value: 0, velocity: 0 }, 100, 0.064, 0.3, 0.8);
    expect(Number.isFinite(state.value)).toBe(true);
    expect(Math.abs(state.value)).toBeLessThan(500);
  });
});

describe('clase Spring', () => {
  function harness(reduced = false) {
    let queued: ((time: number) => void) | null = null;
    let time = 0;
    const updates: number[] = [];
    const spring = new Spring(0, (value) => updates.push(value), {
      reducedMotion: () => reduced,
      requestFrame: (callback) => {
        queued = callback;
        return 1;
      },
      cancelFrame: () => {
        queued = null;
      },
      now: () => time,
    });
    const run = (frames: number) => {
      for (let index = 0; index < frames && queued; index += 1) {
        const callback = queued;
        queued = null;
        time += 16;
        callback(time);
      }
    };
    return { spring, updates, run, pending: () => queued !== null };
  }

  it('anima hasta el destino y se detiene', () => {
    const { spring, run, pending } = harness();
    spring.to(200, { response: 0.3 });
    run(400);
    expect(spring.value).toBe(200);
    expect(pending()).toBe(false);
  });

  it('con movimiento reducido salta directo al destino', () => {
    const { spring, updates, pending } = harness(true);
    spring.to(120);
    expect(spring.value).toBe(120);
    expect(updates).toEqual([120]);
    expect(pending()).toBe(false);
  });

  it('al agarrarla parte del valor visible y no del destino', () => {
    const { spring, run } = harness();
    spring.to(300, { response: 0.4 });
    run(8);
    const visible = spring.value;
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(300);
    spring.stop();
    spring.drag(visible + 20);
    spring.to(0, { velocity: 0, response: 0.4 });
    run(1);
    expect(Math.abs(spring.value - (visible + 20))).toBeLessThan(40);
  });

  it('un nuevo destino conserva la velocidad en curso', () => {
    const { spring, run } = harness();
    spring.to(300, { response: 0.4 });
    run(6);
    const speed = spring.velocity;
    spring.to(0, { response: 0.4 });
    expect(spring.velocity).toBe(speed);
  });
});

describe('proyección, resistencia y puntos de reposo', () => {
