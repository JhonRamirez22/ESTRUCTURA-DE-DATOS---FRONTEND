'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export interface PaletteItem {
  id: string;
  group: string;
  label: string;
  /** Texto secundario alineado a la derecha, p. ej. una guía. */
  hint?: string;
  /** Navega con un enlace (sin recargar la página). */
  href?: string;
  /** Ejecuta una acción que no es navegación. */
  run?: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  items: ReadonlyArray<PaletteItem>;
  label: string;
  placeholder: string;
  emptyText: string;
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Búsqueda y salto rápido para el despachador: pantallas y acciones con el teclado. */
export default function CommandPalette({ open, onClose, items, label, placeholder, emptyText }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [shown, setShown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const listId = useId();

  const results = useMemo(() => {
