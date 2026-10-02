'use client';

import { useState } from 'react';
import { apiJson, ApiRequestError } from '@/lib/apiClient';
import { useT } from '@/lib/preferences';

interface Group {
  ids: string[];
  spreadMeters: number;
  source: 'deterministic' | 'groq-validated';
  reason: string | null;
}

interface GroupsPayload {
  groups: Group[];
  ai: { source: string; proposed: boolean; accepted: number };
}

/** Grupos de pedidos cercanos: Groq propone y el chequeo valida; el despachador elige. */
export default function AiGroupSuggestions({ onSelect }: { onSelect: (ids: string[]) => void }) {
  const t = useT();
  const [data, setData] = useState<GroupsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiJson<GroupsPayload>('/api/inteligencia/agrupaciones'));
    } catch (loadError) {
      setError(loadError instanceof ApiRequestError ? loadError.message : 'No se pudieron calcular los grupos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-label={t('groups.title')} className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{t('groups.title')}</p>
        <button
          className="rp-button rp-button-quiet rp-button-small"
          data-tip="tip.showGroups"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          {loading ? '…' : t('groups.show')}
        </button>
      </div>
      {error ? <p className="rl-notice is-error mt-2">{error}</p> : null}
      {data && data.groups.length === 0 ? <p className="rl-empty">{t('groups.none')}</p> : null}
      {data && data.groups.length > 0 ? (
        <ul className="rl-rows mt-2">
          {data.groups.map((group) => (
            <li className="rl-row !items-start" key={group.ids.join(',')}>
              <span className="rl-row-main">
                <strong>
                  {group.ids.length} · {group.spreadMeters} m
                </strong>
                <span>
                  {group.source === 'groq-validated' ? t('groups.byAi') : t('groups.deterministic')}
                  {group.reason ? ` · ${group.reason}` : ''}
                </span>
              </span>
              <button
                className="rp-button rp-button-secondary rp-button-small"
                onClick={() => onSelect(group.ids)}
                type="button"
              >
                {t('groups.select')}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {data && data.ai.proposed === false ? <p className="mt-2 text-xs">{t('groups.aiOff')}</p> : null}
    </section>
  );
}
