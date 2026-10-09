'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DICTIONARY, type Lang, type MessageKey } from '@/lib/i18n';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'rutas-pasto:theme';
const LANG_KEY = 'rutas-pasto:lang';

interface Preferences {
  theme: Theme;
  lang: Lang;
  setTheme: (theme: Theme) => void;
  setLang: (lang: Lang) => void;
  /** Aviso tras cambiar de idioma: qué queda sin traducir. */
  langNotice: boolean;
  dismissLangNotice: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const PreferencesContext = createContext<Preferences | null>(null);

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  return format(DICTIONARY[lang][key] ?? DICTIONARY.es[key], vars);
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sin almacenamiento (modo privado): la preferencia dura solo esta visita.
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  // El script inicial ya aplicó tema e idioma al documento; se leen de ahí para no parpadear.
  const [theme, setThemeState] = useState<Theme>('light');
  const [lang, setLangState] = useState<Lang>('es');
  const [langNotice, setLangNotice] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    setThemeState(root.dataset.theme === 'dark' ? 'dark' : 'light');
    setLangState(root.lang === 'en' ? 'en' : 'es');
  }, []);

  const setTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      root.classList.add('theme-transition');
      window.setTimeout(() => root.classList.remove('theme-transition'), 260);
    }
    root.dataset.theme = next;
    store(THEME_KEY, next);
    setThemeState(next);
  }, []);

  const setLang = useCallback((next: Lang) => {
    document.documentElement.lang = next;
    store(LANG_KEY, next);
    setLangState(next);
    setLangNotice(true);
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      theme,
      lang,
      setTheme,
      setLang,
      langNotice,
      dismissLangNotice: () => setLangNotice(false),
      t: (key, vars) => translate(lang, key, vars),
    }),
    [theme, lang, setTheme, setLang, langNotice]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

/** Sin proveedor (pruebas aisladas) responde en español, el idioma por defecto. */
export function usePreferences(): Preferences {
  const context = useContext(PreferencesContext);
  if (context) return context;
  return {
    theme: 'light',
    lang: 'es',
    setTheme: () => undefined,
    setLang: () => undefined,
    langNotice: false,
    dismissLangNotice: () => undefined,
    t: (key, vars) => translate('es', key, vars),
  };
}

export function useT() {
  return usePreferences().t;
}

/** Texto traducido; sirve también dentro de componentes de servidor. */
export function Tx({ k, vars }: { k: MessageKey; vars?: Record<string, string | number> }) {
  return <>{usePreferences().t(k, vars)}</>;
}

/** Script previo al pintado: aplica tema e idioma guardados sin parpadeo. */
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${THEME_KEY}');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;var l=localStorage.getItem('${LANG_KEY}');if(l==='en'){d.lang='en'}}catch(e){}})();`;
