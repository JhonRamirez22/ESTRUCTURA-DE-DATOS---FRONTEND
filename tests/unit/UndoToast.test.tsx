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
});

it('muestra el aviso, deshace una vez y lo cierra', () => {
  const onUndo = vi.fn();
  render(<Harness onUndo={onUndo} />);
  fireEvent.click(screen.getByRole('button', { name: 'limpiar' }));
  expect(screen.getByRole('status').textContent).toContain('Selección limpiada');
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
  expect(onUndo).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('status')).toBeNull();
});

it('desaparece a los 6 s sin deshacer', () => {
  const onUndo = vi.fn();
  render(<Harness onUndo={onUndo} />);
  fireEvent.click(screen.getByRole('button', { name: 'limpiar' }));
  act(() => {
    vi.advanceTimersByTime(5900);
  });
  expect(screen.queryByRole('status')).not.toBeNull();
  act(() => {
    vi.advanceTimersByTime(200);
  });
  expect(screen.queryByRole('status')).toBeNull();
  expect(onUndo).not.toHaveBeenCalled();
});

it('un aviso nuevo reemplaza al anterior y reinicia el plazo', () => {
  render(<Harness onUndo={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'limpiar' }));
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  fireEvent.click(screen.getByRole('button', { name: 'limpiar' }));
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  expect(screen.getAllByRole('status')).toHaveLength(1);
});
