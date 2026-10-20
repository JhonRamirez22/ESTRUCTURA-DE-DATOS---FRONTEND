import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppShell from '@/components/AppShell';
import { DICTIONARY } from '@/lib/i18n';
import { PreferencesProvider } from '@/lib/preferences';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

function renderShell() {
  return render(
    <PreferencesProvider>
      <AppShell active="dispatch">
        <p>contenido</p>
      </AppShell>
    </PreferencesProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.lang = 'es';
  // jsdom no implementa matchMedia ni <dialog>; la introducción se prueba aparte.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('preferencias de la interfaz', () => {
  it('cambia a tema oscuro, lo aplica al documento y lo recuerda', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'Tema oscuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('rutas-pasto:theme')).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Tema claro' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('cambia a inglés, traduce la navegación y avisa qué no se traduce', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('link', { name: /Dispatch/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('stay in Spanish');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('describe un botón al pasar el puntero, tras una breve espera', () => {
    vi.useFakeTimers();
    renderShell();
    const help = screen.getByRole('button', { name: 'Cómo funciona' });
    fireEvent.pointerOver(help, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('Muestra la introducción');
    expect(help).toHaveAttribute('aria-describedby', 'rl-tooltip');
    fireEvent.pointerOut(help, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('no describe con toques en pantalla táctil', () => {
    vi.useFakeTimers();
    renderShell();
    fireEvent.pointerOver(screen.getByRole('button', { name: 'Cómo funciona' }), { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('el diccionario inglés cubre todas las claves del español', () => {
    const missing = Object.keys(DICTIONARY.es).filter(
      (key) => !DICTIONARY.en[key as keyof typeof DICTIONARY.en]
    );
    expect(missing).toEqual([]);
  });
});
