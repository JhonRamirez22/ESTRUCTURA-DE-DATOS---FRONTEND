'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const UNDO_WINDOW_MS = 6000;

interface UndoState {
  message: string;
  undo: () => void;
}

/**
 * Aviso con «Deshacer» durante unos segundos, en lugar de un diálogo de confirmación.
 * Solo para acciones que se pueden revertir sin consecuencias en el servidor.
 */
export function useUndoToast(undoLabel: string): { show: (message: string, undo: () => void) => void; node: ReactNode } {
  const [state, setState] = useState<UndoState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setState(null);
  }, []);

  const show = useCallback((message: string, undo: () => void) => {
    window.clearTimeout(timer.current);
    setState({ message, undo });
    timer.current = window.setTimeout(() => setState(null), UNDO_WINDOW_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const node = state ? (
    <div className="rp-toast" role="status">
      <span>{state.message}</span>
      <button
        className="rp-toast-action"
        onClick={() => {
          state.undo();
          dismiss();
        }}
        type="button"
      >
        {undoLabel}
      </button>
      <i aria-hidden="true" className="rp-toast-bar" />
    </div>
  ) : null;

  return { show, node };
}
