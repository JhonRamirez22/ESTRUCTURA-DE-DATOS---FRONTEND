import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommandPalette, { type PaletteItem } from '@/components/CommandPalette';

const run = vi.fn();
const items: PaletteItem[] = [
  { id: 'orders', group: 'Ir a', label: 'Pedidos', href: '/pedidos' },
  { id: 'team', group: 'Ir a', label: 'Personal', href: '/personal' },
  { id: 'theme', group: 'Preferencias', label: 'Tema oscuro', run },
];

function setup(onClose = vi.fn()) {
  render(<CommandPalette emptyText="Nada coincide" items={items} label="Buscar" onClose={onClose} open placeholder="Busca" />);
  return { onClose, input: screen.getByRole('combobox') };
}

afterEach(() => {
  cleanup();
  run.mockReset();
});

describe('paleta de comandos', () => {
  it('lista todo al abrir y filtra sin distinguir tildes ni mayúsculas', () => {
    const { input } = setup();
    expect(screen.getAllByRole('option')).toHaveLength(3);
    fireEvent.change(input, { target: { value: 'PEDIDOS' } });
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Pedidos']);
    fireEvent.change(input, { target: { value: 'preferencias' } });
    expect(screen.getByRole('option', { name: 'Tema oscuro' })).toBeTruthy();
  });

  it('avisa cuando nada coincide', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText('Nada coincide')).toBeTruthy();
  });

  it('se mueve con las flechas y ejecuta la acción elegida con Enter', () => {
    const { input, onClose } = setup();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Tema oscuro' }).getAttribute('aria-selected')).toBe('true');
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('las pantallas son enlaces y Escape cierra', () => {
    const { input, onClose } = setup();
    expect(screen.getByRole('option', { name: 'Personal' }).getAttribute('href')).toBe('/personal');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
