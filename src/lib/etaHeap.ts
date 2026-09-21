import { MinHeap } from '@/core/structures/MinHeap';

export interface StopEta {
  stopId: string;
  estimatedMinutesFromNow: number;
  /** Con historial activado: minutos esperados con la congestión habitual a la hora de llegada. */
  historicalMinutesFromNow?: number;
}

/** Las `count` paradas con menor ETA, extraídas de un min-heap en O(n + k log n). */
export function nearestStopsByEta(etas: StopEta[], count: number): StopEta[] {
  const heap = new MinHeap<StopEta, string>(
    (left, right) => left.estimatedMinutesFromNow - right.estimatedMinutesFromNow,
    (item) => item.stopId,
