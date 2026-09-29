/** Estado del despacho en lenguaje llano: en qué paso está el despachador y qué hace el botón. */

export type DispatchPhase =
  | 'no-orders'
  | 'pick-orders'
  | 'no-couriers'
  | 'pick-couriers'
  | 'ready'
  | 'analyzing'
  | 'proposal'
  | 'stale'
  | 'dispatching';

export interface DispatchFlowInput {
  pendingCount: number;
  selectedOrders: number;
  availableCouriers: number;
  selectedCouriers: number;
  analyzing: boolean;
  dispatching: boolean;
  hasProposal: boolean;
  proposalIsCurrent: boolean;
}

export interface DispatchFlow {
  phase: DispatchPhase;
  /** Paso de 1 a 3 en el que está el despachador. */
  step: 1 | 2 | 3;
  /** Si el botón principal puede pulsarse. */
  canAct: boolean;
  /** Si el botón principal hace «despachar» (en vez de analizar). */
  actionIsDispatch: boolean;
}

export function dispatchFlow(input: DispatchFlowInput): DispatchFlow {
  const {
    pendingCount, selectedOrders, availableCouriers, selectedCouriers,
    analyzing, dispatching, hasProposal, proposalIsCurrent,
  } = input;
  if (dispatching) return { phase: 'dispatching', step: 3, canAct: false, actionIsDispatch: true };
  if (analyzing) return { phase: 'analyzing', step: 2, canAct: false, actionIsDispatch: false };
  if (hasProposal) {
    return proposalIsCurrent
