import { MinHeap } from '@/core/structures/MinHeap';

export interface StopEta {
  stopId: string;
  estimatedMinutesFromNow: number;
}

/** Las `count` paradas con menor ETA, extraídas de un min-heap en O(n + k log n). */
export function nearestStopsByEta(etas: StopEta[], count: number): StopEta[] {
  const heap = new MinHeap<StopEta, string>(
    (left, right) => left.estimatedMinutesFromNow - right.estimatedMinutesFromNow,
    (item) => item.stopId,
  );
  for (const eta of etas) {
    if (Number.isFinite(eta.estimatedMinutesFromNow) && eta.estimatedMinutesFromNow >= 0) {
      heap.insert(eta);
    }
  }
  const nearest: StopEta[] = [];
  while (nearest.length < count && !heap.isEmpty()) {
    const next = heap.extractMin();
    if (next !== undefined) nearest.push(next);
  }
  return nearest;
}
