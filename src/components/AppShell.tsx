'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CircleHelp, Home, Languages, LogIn, Moon, Package, Route, Search, Sun } from 'lucide-react';
import CommandPalette, { type PaletteItem } from '@/components/CommandPalette';
import IntroDialog, { OPEN_INTRO_EVENT } from '@/components/IntroDialog';
import InterfaceIcon from '@/components/InterfaceIcon';
import LogoutButton from '@/components/LogoutButton';
import TooltipLayer from '@/components/TooltipLayer';
import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock';
import type { MessageKey } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';

type NavKey = 'staff' | 'request' | 'tracking' | 'courier' | 'dispatch' | 'live' | 'orders' | 'team' | 'audit' | 'history';

interface AppShellProps {
  children: ReactNode;
  active?: 'home' | 'orders' | 'dispatch' | 'team' | 'audit' | 'history' | 'courier' | 'tracking' | 'request';
}

const navigationBySurface: Record<string, ReadonlyArray<{ href: string; key: NavKey }>> = {
  home: [
    { href: '/acceso', key: 'staff' },
    { href: '/solicitar', key: 'request' },
    { href: '/cliente', key: 'tracking' },
  ],
  tracking: [
    { href: '/solicitar', key: 'request' },
    { href: '/cliente', key: 'tracking' },
  ],
  courier: [{ href: '/repartidor', key: 'courier' }],
  dispatcher: [
    { href: '/dashboard', key: 'dispatch' },
    { href: '/dashboard#en-vivo', key: 'live' },
    { href: '/pedidos', key: 'orders' },
    { href: '/personal', key: 'team' },
    { href: '/historial', key: 'history' },
    { href: '/auditoria', key: 'audit' },
  ],
};

const NAV_ICON: Record<NavKey, 'route' | 'package' | 'search' | 'users'> = {
  staff: 'route',
  request: 'package',
  tracking: 'search',
  courier: 'route',
  dispatch: 'route',
  live: 'route',
  orders: 'package',
  team: 'users',
  audit: 'search',
  history: 'package',
};

export default function AppShell({ children, active }: AppShellProps) {
  const pathname = usePathname();
  const { t, theme, setTheme, lang, setLang, langNotice, dismissLangNotice } = usePreferences();
  const dispatcherSurface = active === 'orders' || active === 'dispatch' || active === 'team' || active === 'audit' || active === 'history';
  const operational = dispatcherSurface || active === 'courier';
  const navigation =
    active === 'tracking' || active === 'request'
      ? navigationBySurface.tracking
      : active === 'courier'
        ? navigationBySurface.courier
        : dispatcherSurface
          ? navigationBySurface.dispatcher
          : navigationBySurface.home;

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // La navegación online sigue funcionando si el navegador rechaza la PWA.
    });
  }, []);

  const label = (key: NavKey) => t(`nav.${key}` as MessageKey);

  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    if (!dispatcherSurface) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatcherSurface]);
  const paletteItems = useMemo<PaletteItem[]>(
    () => [
      ...navigationBySurface.dispatcher!.map((item) => ({
        id: `go-${item.key}`,
        group: t('palette.group.go'),
        label: t(`nav.${item.key}` as MessageKey),
        href: item.href,
      })),
      { id: 'new-order', group: t('palette.group.go'), label: t('dash.registerOrder'), href: '/pedidos' },
      {
        id: 'theme',
        group: t('palette.group.prefs'),
        label: theme === 'dark' ? t('shell.themeToLight') : t('shell.themeToDark'),
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      { id: 'lang', group: t('palette.group.prefs'), label: t('shell.lang'), run: () => setLang(lang === 'es' ? 'en' : 'es') },
      { id: 'help', group: t('palette.group.prefs'), label: t('shell.help'), run: () => window.dispatchEvent(new Event(OPEN_INTRO_EVENT)) },
    ],
    [lang, setLang, setTheme, t, theme]
  );

  return (
    <div className={`rp-shell ${operational ? 'rp-shell-operational' : 'rp-shell-public'}`}>
      <a className="rp-skip-link" href="#main-content">
        {t('shell.skip')}
      </a>
      <header className="rp-shell-header">
        <div className="rp-shell-header-inner">
          <Link className="rp-brand" data-tip="tip.nav.home" href="/" aria-label="Rutas Pasto · Inicio">
            <span className="rp-brand-mark">
              <InterfaceIcon name="route" />
            </span>
            <span className="rp-brand-name">
              Rutas<span>Pasto</span>
            </span>
          </Link>

          <nav aria-label={t('nav.main')} className="rp-navigation" hidden={active === 'courier'}>
            {navigation.map((item) => {
              const isActive = active === item.key || (!active && pathname === item.href);
