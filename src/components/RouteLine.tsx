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
}: {
  stops: LineStop[];
  label: string;
  /** El recorrido seleccionado usa el verde único del mapa; el resto, café. */
  selected?: boolean;
}) {
  return (
    <ol aria-label={label} className={`rl-line ${selected ? 'is-route' : ''}`}>
      {stops.map((stop) => {
        const state = stop.state ?? 'pending';
        return (
          <li className={`rl-stop is-${state}`} key={stop.id}>
            <span aria-hidden="true" className="rl-dot" />
            <span className="rl-stop-label">
              <span className="sr-only">{STATE_TEXT[state]}: </span>
              <span className="rl-stop-text">{stop.label}</span>
              {stop.meta ? <span className="rl-stop-meta">{stop.meta}</span> : null}
            </span>
            {stop.aside ? <span className="rl-stop-aside">{stop.aside}</span> : <span />}
          </li>
        );
      })}
    </ol>
  );
}

/** Progreso de una ruta de un vistazo: un punto por parada sobre una línea horizontal. */
export function RouteStrip({
  states,
  label,
  selected = false,
}: {
  states: Exclude<StopState, 'terminal'>[];
  label: string;
  selected?: boolean;
}) {
  return (
    <ol aria-label={label} className={`rl-strip ${selected ? 'is-route' : ''}`}>
      {states.map((state, index) => (
        <li className={`is-${state}`} key={index}>
          <i aria-hidden="true" />
        </li>
      ))}
    </ol>
  );
}
