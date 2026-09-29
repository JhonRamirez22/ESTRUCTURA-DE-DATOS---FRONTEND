/** Mejora conjunta del reparto que calcula el backend (mueve pedidos entre repartidores). */
export interface AssignmentMove {
  kind: 'relocate' | 'swap';
  deliveryPointId: string;
  fromCourierId: string;
  toCourierId: string;
  swappedDeliveryPointId: string | null;
  gainMinutes: number;
}

export interface AssignmentImprovement {
  enabled: boolean;
  applied: boolean;
  beforeMinutes?: number;
  afterMinutes?: number;
  savedMinutes?: number;
  longestBeforeMinutes?: number;
  longestAfterMinutes?: number;
  evaluations?: number;
  moves?: AssignmentMove[];
}

export type ImprovementTone = 'better-total' | 'better-balance' | 'unchanged';

/** Qué titular mostrar: ahorro total, mejor balance (el total sube un poco) o sin cambios. */
export function improvementTone(improvement: AssignmentImprovement): ImprovementTone {
  if (!improvement.enabled || !improvement.applied) return 'unchanged';
  return (improvement.savedMinutes ?? 0) > 0.05 ? 'better-total' : 'better-balance';
}

/** Los movimientos más útiles primero y como máximo `limit`, para no abrumar al despachador. */
export function topMoves(improvement: AssignmentImprovement, limit = 3): AssignmentMove[] {
  return [...(improvement.moves ?? [])].sort((left, right) => right.gainMinutes - left.gainMinutes).slice(0, limit);
}
