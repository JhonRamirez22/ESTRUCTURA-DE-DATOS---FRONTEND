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
