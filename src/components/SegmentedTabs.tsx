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
