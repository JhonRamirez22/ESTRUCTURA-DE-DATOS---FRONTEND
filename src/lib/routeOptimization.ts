import { MinHeap } from '@/core/structures/MinHeap';

export type OptimizationStep = 'nearestNeighbor' | 'twoOpt' | 'orOpt' | 'aiOrder';

export interface TrafficPoint {
  point: [number, number] | null;
  level: 'FLUIDO' | 'MODERADO' | 'ALTO' | 'MUY_ALTO' | 'CERRADO' | null;
  multiplier: number | null;
  closed: boolean;
  observedAt: string | null;
}

/** Cómo se llegó al orden final; lo calcula el backend con una sola matriz de costos. */
export interface RouteOptimization {
  ladder: Array<{ step: OptimizationStep; minutes: number | null; accepted?: boolean; proposed?: boolean }>;
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
export function mostCongested(points: TrafficPoint[], count: number): CongestedPoint[] {
  if (count <= 0) return [];
  // Un cierre pesa más que cualquier multiplicador.
  // Valor finito: dos cierres empatan en lugar de producir NaN al restar.
  const severity = (item: CongestedPoint) => (item.closed ? 1e9 : item.multiplier);
  const heap = new MinHeap<CongestedPoint, string>(
    (left, right) => severity(left) - severity(right),
    (item) => `${item.point[0]},${item.point[1]}`
  );
  const seen = new Set<string>();
  for (const item of points) {
    if (!item.point || (!item.closed && (item.multiplier === null || item.multiplier < 1.15))) continue;
    const key = `${item.point[0]},${item.point[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    heap.insert({ point: item.point, multiplier: item.multiplier ?? 1, closed: item.closed });
    if (heap.size() > count) heap.extractMin();
  }
  const result: CongestedPoint[] = [];
  while (!heap.isEmpty()) result.push(heap.extractMin()!);
  return result.reverse();
}

/** Porcentaje de tiempo extra de un tramo («+40 %»), o «cerrado». */
export function congestionLabel(item: CongestedPoint, closedText: string): string {
  if (item.closed) return closedText;
  return `+${Math.round((item.multiplier - 1) * 100)} %`;
}
