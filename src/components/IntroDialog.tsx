'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RouteLine } from '@/components/RouteLine';
import { usePreferences } from '@/lib/preferences';

const SEEN_KEY = 'rutas-pasto:intro-seen';
export const OPEN_INTRO_EVENT = 'rutas-pasto:open-intro';

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Sin almacenamiento la introducción vuelve a ofrecerse; no bloquea nada.
  }
}

/** Contexto breve al entrar por primera vez; se reabre desde «Cómo funciona». */
export default function IntroDialog() {
  const { t } = usePreferences();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    const element = dialog.current;
    if (!element || typeof element.showModal !== 'function' || element.open) return;
    element.showModal();
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    markSeen();
    dialog.current?.close();
  }, []);

  useEffect(() => {
    // Los navegadores automatizados (pruebas) no reciben la introducción automática.
    if (!alreadySeen() && !navigator.webdriver) {
      const timer = window.setTimeout(show, 350);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [show]);

  useEffect(() => {
    window.addEventListener(OPEN_INTRO_EVENT, show);
    return () => window.removeEventListener(OPEN_INTRO_EVENT, show);
  }, [show]);

  return (
    <dialog
      aria-labelledby="intro-title"
      className="rl-intro"
      onClick={(event) => {
        // Un clic en el fondo cierra; dentro del panel no.
        if (event.target === dialog.current) close();
      }}
      onClose={() => {
        markSeen();
        setOpen(false);
      }}
      ref={dialog}
    >
      {open ? (
        <div className="rl-intro-panel">
          <p className="rl-intro-kicker">{t('intro.kicker')}</p>
          <h2 id="intro-title">{t('intro.title')}</h2>
          <p className="rl-intro-lead">{t('intro.lead')}</p>
          <div className="rl-intro-line">
            <RouteLine
              label={t('intro.dialog')}
              selected
              stops={[
                { id: 'registro', label: t('intro.step1'), meta: t('intro.step1.meta'), state: 'done' },
                { id: 'despacho', label: t('intro.step2'), meta: t('intro.step2.meta'), state: 'done' },
                { id: 'ruta', label: t('intro.step3'), meta: t('intro.step3.meta'), state: 'current' },
                { id: 'cliente', label: t('intro.step4'), meta: t('intro.step4.meta'), state: 'pending' },
              ]}
            />
          </div>
          <div className="rl-intro-roles">
            <p className="font-semibold">{t('intro.roles')}</p>
            <ul>
              <li>{t('intro.role.dispatch')}</li>
              <li>{t('intro.role.courier')}</li>
              <li>{t('intro.role.client')}</li>
            </ul>
          </div>
          <div className="rl-intro-actions">
            <button className="rp-button rp-button-quiet" onClick={close} type="button">
              {t('intro.skip')}
            </button>
            <button autoFocus className="rp-button rp-button-go" onClick={close} type="button">
              {t('intro.start')}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
