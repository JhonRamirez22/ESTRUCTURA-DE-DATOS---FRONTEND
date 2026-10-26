import { describe, expect, it } from 'vitest';
import { improvementTone, topMoves, type AssignmentImprovement } from '@/lib/assignmentImprovement';

const move = (id: string, gain: number) => ({
  kind: 'relocate' as const,
  deliveryPointId: id,
  fromCourierId: 'a',
  toCourierId: 'b',
  swappedDeliveryPointId: null,
  gainMinutes: gain,
});

