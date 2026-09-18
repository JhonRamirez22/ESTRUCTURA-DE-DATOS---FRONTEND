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
