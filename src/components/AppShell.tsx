'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import LogoutButton from '@/components/LogoutButton';
import InterfaceIcon from '@/components/InterfaceIcon';
import { Home, Package, Route, Search, LogIn } from 'lucide-react';
import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock';

interface AppShellProps {
  children: ReactNode;
  active?: 'home' | 'orders' | 'dispatch' | 'courier' | 'tracking';
}

const navigationBySurface = {
  home: [
    { href: '/acceso', label: 'Personal', key: 'staff' },
    { href: '/cliente', label: 'Seguimiento', key: 'tracking' },
  ],
  tracking: [{ href: '/cliente', label: 'Seguimiento', key: 'tracking' }],
  courier: [{ href: '/repartidor', label: 'Mi ruta', key: 'courier' }],
  dispatcher: [
    { href: '/pedidos', label: 'Pedidos', key: 'orders' },
    { href: '/dashboard', label: 'Despacho', key: 'dispatch' },
  ],
} as const;

export default function AppShell({ children, active }: AppShellProps) {
  const pathname = usePathname();
  const operational = active === 'orders' || active === 'dispatch' || active === 'courier';
  const navigation =
    active === 'tracking'
      ? navigationBySurface.tracking
      : active === 'courier'
        ? navigationBySurface.courier
        : active === 'orders' || active === 'dispatch'
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

  return (
    <div className={`rp-shell ${operational ? 'rp-shell-operational' : 'rp-shell-public'}`}>
      <a className="rp-skip-link" href="#main-content">
        Ir al contenido
      </a>
      <header className="rp-shell-header">
        <div className="rp-shell-header-inner">
          <Link className="rp-brand" href="/" aria-label="Rutas Pasto · Inicio">
            <span className="rp-brand-mark">
              <InterfaceIcon name="route" />
            </span>
            <span className="rp-brand-name">
              Rutas<span>Pasto</span>
            </span>
          </Link>

          <nav aria-label="Navegación principal" className="rp-navigation">
            {navigation.map((item) => {
              const isActive = active === item.key || (!active && pathname === item.href);

              return (
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  className={`rp-nav-item ${isActive ? 'is-active' : ''}`}
                  href={item.href}
                  key={item.href}
