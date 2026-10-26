import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock';
import { InteractiveLogin } from '@/components/ui/interactive-login';
import { cn } from '@/lib/utils';

afterEach(cleanup);

describe('controles UI', () => {
  it('fusiona clases Tailwind sin perder condiciones', () => {
    expect(cn('px-2', false && 'hidden', 'px-4', { flex: true })).toBe('px-4 flex');
  });
  it('el botón no envía formularios por defecto y respeta disabled', () => {
    const click = vi.fn();
    render(
      <Button disabled onClick={click}>
        Guardar
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement;
    expect(button.type).toBe('button');
    fireEvent.click(button);
    expect(click).not.toHaveBeenCalled();
  });
  it('asChild conserva un enlace nativo sin botón anidado', () => {
    render(
      <Button asChild>
        <a href="/pedidos">Pedidos</a>
      </Button>
    );
    expect(screen.getByRole('link', { name: 'Pedidos' }).getAttribute('href')).toBe('/pedidos');
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('el dock vacío sigue siendo navegación y no crea botones falsos', () => {
