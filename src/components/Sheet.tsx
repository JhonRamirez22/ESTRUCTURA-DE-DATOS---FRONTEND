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
