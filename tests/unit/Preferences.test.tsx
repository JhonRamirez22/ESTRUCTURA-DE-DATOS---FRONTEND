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
