import type { ReactNode } from 'react';

export type StopState = 'done' | 'current' | 'pending' | 'terminal';

export interface LineStop {
  id: string;
  label: ReactNode;
  meta?: ReactNode;
  aside?: ReactNode;
  state?: StopState;
}

const STATE_TEXT: Record<StopState, string> = {
  done: 'entregada',
  current: 'parada actual',
  pending: 'pendiente',
  terminal: 'inicio',
};

/** Paradas en orden sobre una línea vertical, como el diagrama de una línea de bus. */
export function RouteLine({
  stops,
  label,
  selected = false,
