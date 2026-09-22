import { MinHeap } from '@/core/structures/MinHeap';

export type OptimizationStep = 'nearestNeighbor' | 'twoOpt' | 'orOpt' | 'refine' | 'aiOrder';

export interface TrafficPoint {
  point: [number, number] | null;
  level: 'FLUIDO' | 'MODERADO' | 'ALTO' | 'MUY_ALTO' | 'CERRADO' | null;
  multiplier: number | null;
  closed: boolean;
  observedAt: string | null;
}

/** Cómo se llegó al orden final; lo calcula el backend con una sola matriz de costos. */
export interface RouteLeg {
  fromStop: string;
  toStop: string;
  minutes: number | null;
}

export interface RouteAlternative {
  step: OptimizationStep;
  minutes: number | null;
  deltaMinutes: number | null;
}

export interface RouteOptimization {
  legs: RouteLeg[];
  alternatives: RouteAlternative[];
  ladder: Array<{
    step: OptimizationStep;
    minutes: number | null;
    accepted?: boolean;
    proposed?: boolean;
    /** Solo en `refine`: exacto (Held-Karp) o búsqueda local iterada. */
