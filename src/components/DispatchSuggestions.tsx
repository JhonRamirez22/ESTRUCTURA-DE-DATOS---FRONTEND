'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '@/lib/apiClient';
import { useT } from '@/lib/preferences';

export interface Suggestion {
  id: string;
  kind: string;
  severity: 'action' | 'warning' | 'info';
  text: string;
  source: 'deterministic' | 'groq-validated';
  action: { type: 'select'; label: string; deliveryPointIds: string[] } | null;
}

interface Payload {
  enabled: boolean;
  suggestions?: Suggestion[];
  cards?: Suggestion[];
}

const REFRESH_MS = 90_000;

/** Avisos del despacho en contexto: sin chat, cada uno con su cifra verificada y un clic. */
export default function DispatchSuggestions({
  refreshKey,
  onSelect,
  endpoint = '/api/inteligencia/sugerencias',
  titleKey = 'suggest.title',
}: {
  refreshKey: unknown;
  onSelect: (ids: string[]) => void;
  endpoint?: string;
  titleKey?: 'suggest.title' | 'shift.title';
}) {
  const t = useT();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const load = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const payload = await apiJson<Payload>(endpoint, { signal });
      setItems(payload.enabled ? (payload.suggestions ?? payload.cards ?? []) : []);
    } catch {
      // Los avisos son un apoyo: si fallan se quedan los últimos y el despacho sigue igual.
    }
  }, [endpoint]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(controller.signal);
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load, refreshKey]);

  const visible = items.filter((item) => !dismissed.includes(item.id));
  if (visible.length === 0) return null;

  return (
    <section aria-label={t(titleKey)} className="mt-4">
      <p className="text-sm font-semibold">{t(titleKey)}</p>
      <ul className="rl-rows mt-2">
        {visible.map((item) => (
          <li className="rl-row !items-start" key={item.id}>
            <span className="rl-row-main">
              <strong>{item.text}</strong>
              <span>{item.source === 'groq-validated' ? t('suggest.byAi') : t('suggest.byRule')}</span>
            </span>
            <span className="flex shrink-0 gap-2">
              {item.action ? (
                <button
                  className="rp-button rp-button-secondary rp-button-small"
                  onClick={() => {
                    onSelect(item.action?.deliveryPointIds ?? []);
                    setDismissed((current) => [...current, item.id]);
                  }}
                  type="button"
                >
                  {t('suggest.select')}
                </button>
              ) : null}
              <button
                aria-label={t('suggest.dismiss')}
                className="rp-button rp-button-quiet rp-button-small"
                onClick={() => setDismissed((current) => [...current, item.id])}
                type="button"
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
