import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useUndoToast } from '@/components/UndoToast';

function Harness({ onUndo }: { onUndo: () => void }) {
  const toast = useUndoToast('Deshacer');
  return (
    <>
      <button onClick={() => toast.show('Selección limpiada', onUndo)} type="button">
        limpiar
      </button>
      {toast.node}
    </>
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
