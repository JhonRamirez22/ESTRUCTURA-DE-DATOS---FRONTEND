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
