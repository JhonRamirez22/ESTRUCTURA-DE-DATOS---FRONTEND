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
