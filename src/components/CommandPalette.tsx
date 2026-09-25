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
    const needle = fold(query.trim());
    return items.filter((item) => fold(`${item.label} ${item.hint ?? ''} ${item.group}`).includes(needle));
  }, [items, query]);

  useEffect(() => {
    if (!open) return undefined;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery('');
    setSelected(0);
    const frame = requestAnimationFrame(() => {
      setShown(true);
      inputRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      setShown(false);
      returnFocus.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const chosen = results[Math.min(selected, results.length - 1)];
  const activate = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    if (item.run) item.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((index) => Math.max(index - 1, 0));
