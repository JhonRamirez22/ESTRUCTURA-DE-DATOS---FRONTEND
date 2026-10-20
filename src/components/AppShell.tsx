'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { CircleHelp, Home, Languages, LogIn, Moon, Package, Route, Search, Sun } from 'lucide-react';
import IntroDialog, { OPEN_INTRO_EVENT } from '@/components/IntroDialog';
import InterfaceIcon from '@/components/InterfaceIcon';
import LogoutButton from '@/components/LogoutButton';
import TooltipLayer from '@/components/TooltipLayer';
import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock';
import type { MessageKey } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';

type NavKey = 'staff' | 'request' | 'tracking' | 'courier' | 'dispatch' | 'live' | 'orders' | 'team';

interface AppShellProps {
  children: ReactNode;
  active?: 'home' | 'orders' | 'dispatch' | 'team' | 'courier' | 'tracking' | 'request';
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
};

export default function AppShell({ children, active }: AppShellProps) {
  const pathname = usePathname();
  const { t, theme, setTheme, lang, setLang, langNotice, dismissLangNotice } = usePreferences();
  const dispatcherSurface = active === 'orders' || active === 'dispatch' || active === 'team';
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
              return (
                <Link
                  aria-current={isActive ? 'page' : undefined}
                  className={`rp-nav-item ${isActive ? 'is-active' : ''}`}
                  data-tip={`tip.nav.${item.key}`}
                  href={item.href}
                  key={item.href}
                >
                  <InterfaceIcon name={NAV_ICON[item.key]} />
                  <span>{label(item.key)}</span>
                  <InterfaceIcon name="arrow" className="rp-nav-arrow" />
                </Link>
              );
            })}
          </nav>
          <div className="rp-shell-account">
            <div className="rp-shell-tools" role="group" aria-label={t('shell.help')}>
              <button
                aria-label={t('shell.help')}
                className="rp-tool"
                data-tip="tip.help"
                onClick={() => window.dispatchEvent(new Event(OPEN_INTRO_EVENT))}
                type="button"
              >
                <CircleHelp aria-hidden="true" />
              </button>
              <button
                aria-label={theme === 'dark' ? t('shell.themeToLight') : t('shell.themeToDark')}
                className="rp-tool rp-tool-theme"
                data-tip="tip.theme"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                type="button"
              >
                <Sun aria-hidden="true" className="rp-tool-sun" />
                <Moon aria-hidden="true" className="rp-tool-moon" />
              </button>
              <button
                aria-label={t('shell.lang')}
                className="rp-tool rp-tool-lang"
                data-tip="tip.lang"
                lang={lang === 'es' ? 'en' : 'es'}
                onClick={() => setLang(lang === 'es' ? 'en' : 'es')}
                type="button"
              >
                <Languages aria-hidden="true" />
                <span>{t('shell.langShort')}</span>
              </button>
            </div>
            {operational ? <LogoutButton /> : null}
            <span className="rp-service-area">
              <InterfaceIcon name="locate" />
              {t('shell.area')}
            </span>
          </div>
        </div>
      </header>
      {langNotice ? (
        <div className="rl-lang-notice" role="status">
          <p>{t('lang.notice')}</p>
          <button className="rp-button rp-button-quiet rp-button-small" onClick={dismissLangNotice} type="button">
            {t('lang.close')}
          </button>
        </div>
      ) : null}
      <div className="rp-shell-content" id="main-content" tabIndex={-1}>
        {children}
      </div>
      {operational ? null : (
        <Dock className="rp-application-dock" ariaLabel={t('nav.quick')}>
          <DockItem>
            <Link href="/" className="ui-dock-action" aria-label={t('nav.home')} data-tip="tip.nav.home">
              <DockIcon>
                <Home />
              </DockIcon>
            </Link>
            <DockLabel>{t('nav.home')}</DockLabel>
          </DockItem>
          {navigation.map((item) => {
            const Icon =
              item.key === 'orders' || item.key === 'request'
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
                  aria-label={label(item.key)}
                  aria-current={isActive ? 'page' : undefined}
                  data-tip={`tip.nav.${item.key}`}
                >
                  <DockIcon>
                    <Icon />
                  </DockIcon>
                </Link>
                <DockLabel>{label(item.key)}</DockLabel>
              </DockItem>
            );
          })}
        </Dock>
      )}
      <TooltipLayer />
      <IntroDialog />
    </div>
  );
}
