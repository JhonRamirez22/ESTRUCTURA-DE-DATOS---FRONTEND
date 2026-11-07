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
    render(<Dock />);
    expect(screen.getByRole('navigation', { name: 'Navegación rápida' })).toBeDefined();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('el dock permite enlaces y muestra etiqueta al enfocar', async () => {
    render(
      <Dock>
        <DockItem>
          <a href="/pedidos" aria-label="Pedidos">
            <DockIcon>
              <svg />
            </DockIcon>
          </a>
          <DockLabel>Pedidos</DockLabel>
        </DockItem>
      </Dock>
    );
    const link = screen.getByRole('link', { name: 'Pedidos' });
    fireEvent.focus(link);
    expect(await screen.findByText('Pedidos')).toBeDefined();
    expect(link.parentElement?.getAttribute('role')).toBeNull();
    expect(link.parentElement?.hasAttribute('tabindex')).toBe(false);
  });
  it('el login revela la contraseña sin enviar ni alterar su valor', () => {
    const submit = vi.fn();
    render(<InteractiveLogin onSubmit={submit} />);
    const password = screen.getByLabelText('Contraseña') as HTMLInputElement;
    fireEvent.change(password, { target: { value: ' secreto privado ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(password.type).toBe('text');
    expect(password.value).toBe(' secreto privado ');
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(password.type).toBe('password');
  });
  it('bloquea envíos simultáneos y habilita recuperación al fallar', async () => {
    let reject: (cause: Error) => void = () => {};
    const submit = vi.fn(
      () =>
        new Promise<void>((_, rejectPromise) => {
          reject = rejectPromise;
        })
    );
    render(<InteractiveLogin onSubmit={submit} />);
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'a@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), {
      target: { value: 'contraseña privada' },
    });
    const form = screen.getByRole('button', { name: 'Ingresar' }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByRole('button', { name: 'Verificando…' }) as HTMLButtonElement).disabled
    ).toBe(true);
    reject(new Error('Servicio temporalmente no disponible.'));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Servicio temporalmente no disponible'
    );
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Ingresar' }) as HTMLButtonElement).disabled).toBe(
        false
      )
    );
  });
});
