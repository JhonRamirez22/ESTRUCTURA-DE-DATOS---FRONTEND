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
    kind?: 'exact' | 'ils' | 'none';
    provenOptimal?: boolean;
    lowerBoundMinutes?: number | null;
  }>;
  baselineMinutes: number | null;
  optimizedMinutes: number | null;
  savedMinutes: number | null;
  baselineOrder: string[];
  optimizedOrder: string[];
  baselineGeometry: { type: 'LineString'; coordinates: Array<[number, number]> } | null;
  trafficPoints: TrafficPoint[];
  tomtom: { configured: boolean; applied: boolean; sampled: number; adjusted: number; closed: number; segments: number };
  groq: {
    trafficSource: string | null;
    trafficApplied: boolean;
    model: string | null;
    orderProposed: boolean;
    orderAccepted: boolean;
    orderSavingMinutes: number | null;
    orderReason: string | null;
  };
  computedAt: string;
}

export interface CongestedPoint {
  point: [number, number];
  multiplier: number;
  closed: boolean;
}

/**
 * Los `count` tramos más lentos medidos por TomTom, en O(n log k).
 * Un min-heap de tamaño k conserva los peores: si entra uno peor, sale el más leve.
 */
