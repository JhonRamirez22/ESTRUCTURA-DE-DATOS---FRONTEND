'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import {
  Spring,
  constrainDrag,
  dampingForRelease,
  nearestSnap,
  project,
  releaseVelocity,
  type PointerSample,
} from '@/lib/spring';

/** Zona del escenario que queda libre para el mapa, en píxeles del escenario. */
export interface FreeArea {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface SheetLayout {
  wide: boolean;
  free: FreeArea;
  /** Margen que el mapa debe respetar en cada lado para que la hoja no tape la ruta. */
  inset: { top: number; right: number; bottom: number; left: number };
}

function layoutOf(wide: boolean, free: FreeArea, width: number, height: number): SheetLayout {
  return { wide, free, inset: { top: free.y0, right: width - free.x1, bottom: height - free.y1, left: free.x0 } };
}

export interface SheetProps {
  /** Nombre accesible del panel. */
  label: string;
  /** Texto del botón que cambia la altura de la hoja. */
  grabberLabel: string;
  head: ReactNode;
  /** Acción principal: en la hoja va justo debajo del encabezado para no quedar fuera de vista. */
  foot?: ReactNode;
  children: ReactNode;
  /** 0 completa, 1 media, 2 mínima. */
  initialSnap?: 0 | 1 | 2;
  /** Alto visible en la altura mínima, en px. */
  peek?: number;
  /** Fracción del escenario que ocupa la hoja en la altura media. */
  mid?: number;
  /** Ancho del escenario desde el que la hoja pasa a ser panel lateral. */
  panelMinWidth?: number;
  panelWidth?: number;
  onLayout?: (layout: SheetLayout) => void;
  className?: string;
}

const FULL_TOP = 56;
const PANEL_MARGIN = 16;

/**
 * Hoja de vidrio sobre el mapa. En pantallas estrechas se agarra y se lanza entre tres alturas:
 * sigue al dedo 1:1, hereda su velocidad al soltar y puede revertirse en cualquier instante.
 * Con espacio suficiente es un panel lateral fijo. Debe ir dentro de un contenedor posicionado.
 */
export default function Sheet({
  label,
  grabberLabel,
  head,
  foot,
  children,
  initialSnap = 1,
  peek = 150,
  mid = 0.52,
  panelMinWidth = 720,
  panelWidth = 392,
  onLayout,
  className = '',
}: SheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const springRef = useRef<Spring | null>(null);
  const snapsRef = useRef<number[]>([FULL_TOP, 300, 500]);
  const indexRef = useRef<number>(initialSnap);
  const dragRef = useRef<{ startY: number; origin: number; samples: PointerSample[] } | null>(null);
  const onLayoutRef = useRef(onLayout);
  const [wide, setWide] = useState(false);
  const [isFull, setIsFull] = useState(initialSnap === 0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    onLayoutRef.current = onLayout;
  }, [onLayout]);

  const paint = useCallback((y: number) => {
    const element = sheetRef.current;
    if (element) element.style.transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
  }, []);

  useEffect(() => {
    const spring = new Spring(0, paint, {
      reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    });
    springRef.current = spring;
    return () => spring.stop();
  }, [paint]);

  useEffect(() => {
    const stage = sheetRef.current?.parentElement;
    const spring = springRef.current;
    if (!stage || !spring) return undefined;
    const layout = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      const isWide = width >= panelMinWidth;
      setWide(isWide);
      if (isWide) {
        spring.stop();
        if (sheetRef.current) sheetRef.current.style.transform = '';
        onLayoutRef.current?.(
          layoutOf(true, { x0: PANEL_MARGIN + panelWidth + 28, x1: width - 28, y0: 64, y1: height - 28 }, width, height)
        );
        return;
      }
      const middle = Math.round(height * mid);
      snapsRef.current = [FULL_TOP, middle, height - peek];
      stage.style.setProperty('--sheet-full', `${FULL_TOP}px`);
      spring.set(snapsRef.current[indexRef.current]!);
      onLayoutRef.current?.(
        layoutOf(false, { x0: 16, x1: width - 16, y0: 64, y1: Math.max(120, middle - 14) }, width, height)
      );
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [mid, panelMinWidth, panelWidth, peek]);

  const snapTo = useCallback((index: number, velocity = 0, damping = 1) => {
    const spring = springRef.current;
    if (!spring) return;
    indexRef.current = Math.min(2, Math.max(0, index));
    setIsFull(indexRef.current === 0);
    spring.to(snapsRef.current[indexRef.current]!, { velocity, response: 0.38, damping });
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const spring = springRef.current;
    if (!spring || wide || event.button > 0) return;
    if (event.currentTarget !== event.target && (event.target as HTMLElement).closest('button,input,a,select,textarea,[role=tab]') && !(event.currentTarget as HTMLElement).classList.contains('rp-sheet-grabber')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    spring.stop();
    dragRef.current = { startY: event.clientY, origin: spring.value, samples: [{ time: event.timeStamp, y: event.clientY }] };
    setDragging(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const spring = springRef.current;
    if (!drag || !spring) return;
    const snaps = snapsRef.current;
    spring.drag(constrainDrag(drag.origin + (event.clientY - drag.startY), snaps[0]!, snaps[2]!));
    drag.samples.push({ time: event.timeStamp, y: event.clientY });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[0]!.time > 100) drag.samples.shift();
  };

  const onPointerUp = () => {
    const drag = dragRef.current;
    const spring = springRef.current;
    if (!drag || !spring) return;
    dragRef.current = null;
    setDragging(false);
    const velocity = releaseVelocity(drag.samples);
    const target = nearestSnap(snapsRef.current, spring.value + project(velocity));
    snapTo(target, velocity, dampingForRelease(velocity));
  };

  const onGrabberKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      snapTo(indexRef.current - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      snapTo(indexRef.current + 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      snapTo(indexRef.current === 0 ? 2 : indexRef.current - 1);
    }
  };

  const handlers = { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
  const state = [wide ? 'is-panel' : '', isFull ? 'is-full' : '', dragging ? 'is-dragging' : ''].filter(Boolean).join(' ');

  return (
    <aside aria-label={label} className={`rp-sheet ${state} ${className}`.trim()} ref={sheetRef}>
      <button
        aria-label={grabberLabel}
        className="rp-sheet-grabber"
        onKeyDown={onGrabberKey}
        type="button"
        {...handlers}
      >
        <span className="rp-sheet-grip" />
      </button>
      <div className="rp-sheet-head" {...handlers}>
        {head}
      </div>
      {foot ? <div className="rp-sheet-foot">{foot}</div> : null}
      <div className="rp-sheet-body">{children}</div>
    </aside>
  );
}
