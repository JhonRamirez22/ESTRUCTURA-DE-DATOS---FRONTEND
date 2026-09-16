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
