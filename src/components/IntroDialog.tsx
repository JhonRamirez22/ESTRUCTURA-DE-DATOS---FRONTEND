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
