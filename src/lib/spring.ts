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

  private get requestFrame(): Frame {
    return this.options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
  }

  to(target: number, options: SpringOptions = {}): void {
    this.target = target;
    if (options.velocity !== undefined) this.velocity = options.velocity;
    this.response = options.response ?? 0.4;
    this.damping = options.damping ?? 1;
    if (this.options.reducedMotion?.()) {
      this.set(target);
      return;
    }
    if (!this.frame) {
      this.last = (this.options.now ?? (() => performance.now()))();
      this.frame = this.requestFrame((time) => this.tick(time));
    }
  }

  /** Detiene la animación conservando el valor visible, como al agarrar la hoja. */
  stop(): void {
    if (this.frame) (this.options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle)))(this.frame);
    this.frame = 0;
  }

  set(value: number): void {
    this.stop();
    this.value = value;
    this.target = value;
    this.velocity = 0;
    this.onUpdate(value);
  }

  /** Mueve el valor sin animar (arrastre 1:1) manteniendo el resorte detenido. */
  drag(value: number): void {
    this.stop();
    this.value = value;
    this.velocity = 0;
    this.onUpdate(value);
  }

  private tick(time: number): void {
    const dt = Math.min(Math.max((time - this.last) / 1000, 0), MAX_FRAME);
    this.last = time;
    const next = stepSpring({ value: this.value, velocity: this.velocity }, this.target, dt, this.response, this.damping);
    this.value = next.value;
    this.velocity = next.velocity;
    if (isAtRest(next, this.target)) {
      this.value = this.target;
      this.velocity = 0;
      this.frame = 0;
      this.onUpdate(this.value);
      return;
    }
    this.onUpdate(this.value);
    this.frame = this.requestFrame((nextTime) => this.tick(nextTime));
  }
}

/** Dónde se detendría un gesto que sale con `velocity` px/s (decaimiento exponencial, como el scroll). */
export function project(velocity: number, deceleration = 0.998): number {
  return ((velocity / 1000) * deceleration) / (1 - deceleration);
}

/** Resistencia progresiva más allá de un borde: la hoja sigue al dedo cada vez menos. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Índice del punto de reposo más cercano a `position`. */
export function nearestSnap(snaps: readonly number[], position: number): number {
  let best = 0;
  snaps.forEach((snap, index) => {
    if (Math.abs(snap - position) < Math.abs(snaps[best]! - position)) best = index;
  });
  return best;
}

export interface PointerSample {
  time: number;
  y: number;
}

/** Velocidad vertical (px/s) con las últimas muestras; 0 si no hay movimiento medible. */
export function releaseVelocity(samples: readonly PointerSample[]): number {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) return 0;
  const seconds = (last.time - first.time) / 1000;
  return seconds > 0.005 ? (last.y - first.y) / seconds : 0;
}

/** Posición con resistencia: libre entre los extremos, comprimida fuera de ellos. */
export function constrainDrag(position: number, low: number, high: number, dimension = 220): number {
  if (position < low) return low - rubberband(low - position, dimension);
  if (position > high) return high + rubberband(position - high, dimension);
  return position;
}

/** El rebote solo aparece si el gesto traía impulso; en el resto de casos se asienta sin oscilar. */
export function dampingForRelease(velocity: number): number {
  return Math.abs(velocity) > 420 ? 0.8 : 1;
}
