/**
 * Física de la hoja: resorte con respuesta y amortiguamiento, proyección de impulso y
 * resistencia en los bordes. Es código puro (sin DOM) para poder probarlo.
 */

export interface SpringOptions {
  /** Segundos que tarda en alcanzar el destino; no es una duración fija. */
  response?: number;
  /** 1 = sin rebote; menos de 1 rebota. */
  damping?: number;
  /** Velocidad inicial en unidades por segundo; si falta se conserva la actual. */
  velocity?: number;
}

export interface SpringState {
  value: number;
  velocity: number;
}

const FIXED_STEP = 1 / 240;
const MAX_FRAME = 0.064;
const REST_DISTANCE = 0.01;
const REST_VELOCITY = 0.05;

/** Avanza el resorte `dt` segundos con pasos fijos (semi-implícito de Euler, estable). */
export function stepSpring(state: SpringState, target: number, dt: number, response: number, damping: number): SpringState {
  const omega = (2 * Math.PI) / response;
  const steps = Math.max(1, Math.ceil(dt / FIXED_STEP));
  const step = dt / steps;
  let { value, velocity } = state;
  for (let index = 0; index < steps; index += 1) {
    const acceleration = -omega * omega * (value - target) - 2 * damping * omega * velocity;
    velocity += acceleration * step;
    value += velocity * step;
  }
  return { value, velocity };
}

export function isAtRest(state: SpringState, target: number): boolean {
  return Math.abs(state.value - target) < REST_DISTANCE && Math.abs(state.velocity) < REST_VELOCITY;
}

type Frame = (callback: (time: number) => void) => number;

/**
 * Resorte animado. Parte siempre del valor visible y conserva la velocidad, de modo que
 * puede interrumpirse y reorientarse en cualquier instante sin saltos.
 */
export class Spring {
  value: number;
  velocity = 0;
  private target: number;
  private frame = 0;
  private last = 0;
  private response = 0.4;
  private damping = 1;

  constructor(
    initial: number,
    private readonly onUpdate: (value: number) => void,
    private readonly options: {
      reducedMotion?: () => boolean;
      requestFrame?: Frame;
      cancelFrame?: (handle: number) => void;
      now?: () => number;
    } = {}
  ) {
    this.value = initial;
    this.target = initial;
  }
