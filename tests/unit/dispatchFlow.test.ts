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
    expect(flow({ hasProposal: true, proposalIsCurrent: true })).toMatchObject({ phase: 'proposal', step: 3, canAct: true, actionIsDispatch: true });
    expect(flow({ hasProposal: true, proposalIsCurrent: false })).toMatchObject({ phase: 'stale', canAct: true, actionIsDispatch: false });
    expect(flow({ hasProposal: true, proposalIsCurrent: false, selectedOrders: 0 }).canAct).toBe(false);
  });

  it('mientras analiza o despacha no se puede pulsar de nuevo', () => {
    expect(flow({ analyzing: true })).toMatchObject({ phase: 'analyzing', canAct: false });
    expect(flow({ dispatching: true, hasProposal: true, proposalIsCurrent: true })).toMatchObject({ phase: 'dispatching', step: 3, canAct: false });
  });
});

describe('defaultCourierSelection', () => {
  it('marca todos los disponibles la primera vez', () => {
    const result = defaultCourierSelection(['a', 'b', 'c'], new Set(), []);
    expect(result.selection).toEqual(['a', 'b', 'c']);
  });

  it('respeta lo que el despachador desmarcó y suma solo a los recién disponibles', () => {
    const first = defaultCourierSelection(['a', 'b'], new Set(), []);
    const afterUncheck = defaultCourierSelection(['a', 'b'], first.known, ['a']);
    expect(afterUncheck.selection).toEqual(['a']);
    const withNewcomer = defaultCourierSelection(['a', 'b', 'c'], afterUncheck.known, ['a']);
    expect(withNewcomer.selection).toEqual(['a', 'c']);
  });

  it('quien pierde el GPS y vuelve se marca otra vez', () => {
    const online = defaultCourierSelection(['a', 'b'], new Set(), []);
    const offline = defaultCourierSelection([], online.known, online.selection);
    expect(offline.selection).toEqual([]);
    const back = defaultCourierSelection(['a', 'b'], offline.known, offline.selection);
    expect(back.selection).toEqual(['a', 'b']);
  });

  it('quita a quien dejó de estar disponible', () => {
    const result = defaultCourierSelection(['a'], new Set(['a', 'b']), ['a', 'b']);
    expect(result.selection).toEqual(['a']);
  });
});
