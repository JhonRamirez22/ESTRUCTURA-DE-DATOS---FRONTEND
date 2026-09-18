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
