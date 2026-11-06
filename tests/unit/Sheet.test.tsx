import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Sheet from '@/components/Sheet';

function stageSize(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(height);
}

function renderSheet(onLayout = vi.fn()) {
  render(
    <div>
      <Sheet foot={<button type="button">Acción principal</button>} grabberLabel="Cambiar altura" head={<h1>Despacho</h1>} label="Panel" onLayout={onLayout}>
        <p>Contenido</p>
      </Sheet>
    </div>
  );
  return onLayout;
}

describe('Sheet', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('es un panel lateral cuando el escenario es ancho y avisa del área libre del mapa', () => {
    stageSize(1200, 760);
    const onLayout = renderSheet();
    expect(screen.getByRole('complementary', { name: 'Panel' }).className).toContain('is-panel');
    expect(onLayout).toHaveBeenLastCalledWith({
      wide: true,
      free: { x0: 436, x1: 1172, y0: 64, y1: 732 },
      inset: { top: 64, right: 28, bottom: 28, left: 436 },
    });
  });

  it('es una hoja en pantallas estrechas y deja libre el mapa sobre la altura media', () => {
    stageSize(390, 700);
    const onLayout = renderSheet();
    expect(screen.getByRole('complementary', { name: 'Panel' }).className).not.toContain('is-panel');
    expect(onLayout).toHaveBeenLastCalledWith({
      wide: false,
      free: { x0: 16, x1: 374, y0: 64, y1: 350 },
      inset: { top: 64, right: 16, bottom: 350, left: 16 },
    });
  });

  it('cambia de altura con el teclado y la altura completa habilita el desplazamiento', () => {
    stageSize(390, 700);
    renderSheet();
    const sheet = screen.getByRole('complementary', { name: 'Panel' });
    const grabber = screen.getByRole('button', { name: 'Cambiar altura' });
    expect(sheet.className).not.toContain('is-full');
    act(() => {
      fireEvent.keyDown(grabber, { key: 'ArrowUp' });
    });
    expect(sheet.className).toContain('is-full');
    act(() => {
      fireEvent.keyDown(grabber, { key: 'ArrowDown' });
    });
    expect(sheet.className).not.toContain('is-full');
  });

  it('mantiene la acción principal visible y accesible junto al encabezado', () => {
    stageSize(390, 700);
    renderSheet();
    expect(screen.getByRole('button', { name: 'Acción principal' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Despacho' })).toBeTruthy();
  });
});
