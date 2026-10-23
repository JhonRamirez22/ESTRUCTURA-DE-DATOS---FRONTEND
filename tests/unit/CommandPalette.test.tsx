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
