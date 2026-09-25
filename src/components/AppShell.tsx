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
