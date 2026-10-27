import { describe, expect, it } from 'vitest';
import { defaultCourierSelection, dispatchFlow, type DispatchFlowInput } from '@/lib/dispatchFlow';

const base: DispatchFlowInput = {
  pendingCount: 14, selectedOrders: 14, availableCouriers: 4, selectedCouriers: 4,
  analyzing: false, dispatching: false, hasProposal: false, proposalIsCurrent: false,
};
const flow = (patch: Partial<DispatchFlowInput>) => dispatchFlow({ ...base, ...patch });

describe('dispatchFlow', () => {
  it('guía cada situación con su paso y dice si se puede actuar', () => {
    expect(flow({ pendingCount: 0, selectedOrders: 0 })).toMatchObject({ phase: 'no-orders', step: 1, canAct: false });
    expect(flow({ selectedOrders: 0 })).toMatchObject({ phase: 'pick-orders', step: 1, canAct: false });
    expect(flow({ availableCouriers: 0, selectedCouriers: 0 })).toMatchObject({ phase: 'no-couriers', step: 2, canAct: false });
    expect(flow({ selectedCouriers: 0 })).toMatchObject({ phase: 'pick-couriers', step: 2, canAct: false });
    expect(flow({})).toMatchObject({ phase: 'ready', step: 2, canAct: true, actionIsDispatch: false });
  });

  it('con propuesta vigente el botón despacha; si la selección cambió vuelve a analizar', () => {
