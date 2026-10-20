'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MessageKey } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';

const OPEN_DELAY_MS = 450;
// Si otra descripción se cerró hace menos que esto, la siguiente aparece sin espera ni animación.
const WARM_WINDOW_MS = 400;
const EDGE = 12;
const TOOLTIP_ID = 'rl-tooltip';

interface TipState {
  key: MessageKey;
  x: number;
  y: number;
  below: boolean;
  instant: boolean;
}

/**
 * Describe la acción de cualquier control con `data-tip="<clave>"`.
 * Un solo oyente por documento: los controles solo declaran su clave.
 */
export default function TooltipLayer() {
  const { t } = usePreferences();
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<number | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const lastClosed = useRef(0);

  useEffect(() => {
    const clearTimer = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
    const hide = () => {
      clearTimer();
      if (target.current) {
        target.current.removeAttribute('aria-describedby');
        lastClosed.current = Date.now();
      }
      target.current = null;
      setTip(null);
    };
    const show = (element: HTMLElement, instant: boolean) => {
      const key = element.dataset.tip as MessageKey | undefined;
      if (!key) return;
      const rect = element.getBoundingClientRect();
      const below = rect.top < 64;
      const x = Math.min(Math.max(rect.left + rect.width / 2, 120 + EDGE), window.innerWidth - 120 - EDGE);
      target.current = element;
      element.setAttribute('aria-describedby', TOOLTIP_ID);
      setTip({ key, x, y: below ? rect.bottom + 8 : rect.top - 8, below, instant });
    };
    const schedule = (element: HTMLElement, viaKeyboard: boolean) => {
      if (target.current === element) return;
      clearTimer();
      const warm = tip !== null || Date.now() - lastClosed.current < WARM_WINDOW_MS;
      if (target.current) hide();
      if (warm || viaKeyboard) {
        show(element, true);
        return;
      }
      timer.current = window.setTimeout(() => show(element, false), OPEN_DELAY_MS);
    };

    const onPointerOver = (event: PointerEvent) => {
      // En pantallas táctiles el "hover" llega con el toque: no se describe.
      if (event.pointerType !== 'mouse') return;
      const element = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]');
      if (element) schedule(element, false);
    };
    const onPointerOut = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]');
      const next = (event.relatedTarget as Element | null)?.closest('[data-tip]');
      if (element && element !== next) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const element = (event.target as Element | null)?.closest<HTMLElement>('[data-tip]');
      if (element?.matches(':focus-visible')) schedule(element, true);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };

    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => {
      clearTimer();
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
    };
  }, [tip]);

  if (!tip || typeof document === 'undefined') return null;
  return createPortal(
    <div
      className={`rl-tooltip ${tip.below ? 'is-below' : ''} ${tip.instant ? 'is-instant' : ''}`}
      id={TOOLTIP_ID}
      role="tooltip"
      style={{ left: tip.x, top: tip.y }}
    >
      {t(tip.key)}
    </div>,
    document.body
  );
}
