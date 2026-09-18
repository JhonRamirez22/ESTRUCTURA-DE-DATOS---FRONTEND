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
