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
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (chosen?.href) document.getElementById(`${listId}-${chosen.id}`)?.click();
      else activate(chosen);
    } else if (event.key === 'Tab') {
      event.preventDefault();
    }
  };

  let lastGroup = '';
  return (
    <div
      className={`rp-palette-scrim ${shown ? 'is-in' : ''}`}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-label={label} aria-modal="true" className="rp-palette" role="dialog">
        <input
          aria-activedescendant={chosen ? `${listId}-${chosen.id}` : undefined}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded="true"
          autoComplete="off"
          className="rp-palette-input"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          placeholder={placeholder}
          ref={inputRef}
          role="combobox"
          value={query}
        />
        <ul id={listId} role="listbox">
          {results.length === 0 ? (
            <li className="rp-palette-empty" role="presentation">
              {emptyText}
            </li>
          ) : null}
          {results.map((item, index) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            const content = (
              <>
                <span>{item.label}</span>
                {item.hint ? <small>{item.hint}</small> : null}
              </>
            );
            const common = {
              className: 'rp-palette-option',
              id: `${listId}-${item.id}`,
              onMouseMove: () => setSelected(index),
              role: 'option' as const,
              'aria-selected': index === selected,
            };
            return (
              <li key={item.id} role="presentation">
                {heading ? <p className="rp-palette-group">{heading}</p> : null}
                {item.href ? (
                  <Link {...common} href={item.href} onClick={onClose}>
                    {content}
                  </Link>
                ) : (
                  <button {...common} onClick={() => activate(item)} tabIndex={-1} type="button">
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
