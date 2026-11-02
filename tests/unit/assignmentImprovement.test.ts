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

describe('mejora conjunta del reparto', () => {
  it('sin cambios cuando está apagada o no movió nada', () => {
    expect(improvementTone({ enabled: false, applied: false })).toBe('unchanged');
    expect(improvementTone({ enabled: true, applied: false })).toBe('unchanged');
  });

  it('distingue ahorro total de mejor balance', () => {
    const base: AssignmentImprovement = { enabled: true, applied: true, savedMinutes: 4.2 };
    expect(improvementTone(base)).toBe('better-total');
    expect(improvementTone({ ...base, savedMinutes: -1 })).toBe('better-balance');
    expect(improvementTone({ ...base, savedMinutes: 0 })).toBe('better-balance');
  });
