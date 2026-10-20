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
  active?: 'home' | 'orders' | 'dispatch' | 'team' | 'courier' | 'tracking';
}

const navigationBySurface = {
  home: [
    { href: '/acceso', label: 'Personal', key: 'staff' },
    { href: '/cliente', label: 'Seguimiento', key: 'tracking' },
  ],
  tracking: [{ href: '/cliente', label: 'Seguimiento', key: 'tracking' }],
  courier: [{ href: '/repartidor', label: 'Mi ruta', key: 'courier' }],
  dispatcher: [
    { href: '/dashboard', label: 'Despacho', key: 'dispatch' },
    { href: '/dashboard#en-vivo', label: 'En vivo', key: 'live' },
    { href: '/pedidos', label: 'Pedidos', key: 'orders' },
    { href: '/personal', label: 'Personal', key: 'team' },
  ],
} as const;

export default function AppShell({ children, active }: AppShellProps) {
  const pathname = usePathname();
  const dispatcherSurface = active === 'orders' || active === 'dispatch' || active === 'team';
  const operational = dispatcherSurface || active === 'courier';
  const navigation =
    active === 'tracking'
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

  return (
    <div
      className={`rp-shell ${operational ? 'rp-shell-operational' : 'rp-shell-public'}`}
    >
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

          <nav
            aria-label="Navegación principal"
            className="rp-navigation"
            hidden={active === 'courier' || active === 'tracking'}
          >
            {navigation.map((item) => {
              const isActive = active === item.key || (!active && pathname === item.href);

              return (
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  className={`rp-nav-item ${isActive ? 'is-active' : ''}`}
                  href={item.href}
                  key={item.href}
                >
                  <InterfaceIcon
                    name={
                      item.key === 'orders'
                        ? 'package'
                        : item.key === 'tracking'
                          ? 'search'
                          : item.key === 'team'
                            ? 'users'
                            : 'route'
                    }
                  />
                  <span>{item.label}</span>
                  <InterfaceIcon name="arrow" className="rp-nav-arrow" />
                </Link>
              );
            })}
          </nav>
          <div className="rp-shell-account">
            {operational ? (
              <LogoutButton />
            ) : null}
            <span className="rp-service-area">
              <InterfaceIcon name="locate" />
              Pasto, Nariño
            </span>
          </div>
        </div>
      </header>
      <div className="rp-shell-content" id="main-content" tabIndex={-1}>
        {children}
      </div>
      {operational ? null : (
      <Dock className="rp-application-dock" ariaLabel="Accesos rápidos">
        <DockItem>
          <Link href="/" className="ui-dock-action" aria-label="Inicio">
            <DockIcon>
              <Home />
            </DockIcon>
          </Link>
          <DockLabel>Inicio</DockLabel>
        </DockItem>
        {navigation.map((item) => {
          const Icon =
            item.key === 'orders'
              ? Package
              : item.key === 'tracking'
                ? Search
                : item.key === 'staff'
                  ? LogIn
                  : Route;
          const isActive = active === item.key || (!active && pathname === item.href);
          return (
            <DockItem key={item.href} className={isActive ? 'is-active' : undefined}>
              <Link
                href={item.href}
                className="ui-dock-action"
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <DockIcon>
                  <Icon />
                </DockIcon>
              </Link>
              <DockLabel>{item.label}</DockLabel>
            </DockItem>
          );
        })}
      </Dock>
      )}
    </div>
  );
}
