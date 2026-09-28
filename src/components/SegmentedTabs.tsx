'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Spring } from '@/lib/spring';

export interface SegmentedTab<T extends string> {
  id: T;
  label: string;
  /** Cuenta que se muestra junto al nombre, p. ej. pedidos pendientes. */
  count?: ReactNode;
}

interface SegmentedTabsProps<T extends string> {
  tabs: ReadonlyArray<SegmentedTab<T>>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Prefijo para enlazar cada pestaña con su panel (`${idPrefix}-panel`). */
  idPrefix: string;
}

/** Pestañas segmentadas: el indicador se desplaza con un resorte, no con una duración fija. */
export default function SegmentedTabs<T extends string>({ tabs, value, onChange, label, idPrefix }: SegmentedTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const xRef = useRef<Spring | null>(null);
  const widthRef = useRef<Spring | null>(null);
  const firstRef = useRef(true);

  useEffect(() => {
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    xRef.current = new Spring(0, (x) => {
      if (indicatorRef.current) indicatorRef.current.style.transform = `translateX(${x}px)`;
    }, { reducedMotion: reduced });
    widthRef.current = new Spring(0, (width) => {
      if (indicatorRef.current) indicatorRef.current.style.width = `${width}px`;
    }, { reducedMotion: reduced });
    return () => {
      xRef.current?.stop();
      widthRef.current?.stop();
    };
  }, []);

  useLayoutEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!active || !xRef.current || !widthRef.current) return;
    if (firstRef.current) {
      xRef.current.set(active.offsetLeft);
      widthRef.current.set(active.offsetWidth);
      firstRef.current = false;
    } else {
      xRef.current.to(active.offsetLeft, { response: 0.36 });
      widthRef.current.to(active.offsetWidth, { response: 0.36 });
    }
  }, [value, tabs.length]);

  // El panel cambia de ancho al pasar de hoja a panel lateral: se vuelve a medir sin animar.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    const observer = new ResizeObserver(() => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      xRef.current?.set(active.offsetLeft);
      widthRef.current?.set(active.offsetWidth);
    });
    observer.observe(list);
