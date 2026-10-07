'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { SessionChangeNotice } from '@/components/SessionChangeNotice';
import { apiJson, ApiRequestError } from '@/lib/apiClient';
import {
  EMPTY_FILTER,
  HISTORY_STATUSES,
  formatBogota,
  historyQuery,
  pageCount,
  type HistoryFilter,
  type HistoryItem,
  type HistoryPage,
  type TimelineEvent,
} from '@/lib/history';
import type { MessageKey } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';

const PAGE_SIZE = 25;

/** Historial de envíos: lista filtrable y línea de tiempo de cada uno (solo despacho). */
export default function HistoryPage() {
  const { t, lang } = usePreferences();
  const [filter, setFilter] = useState<HistoryFilter>(EMPTY_FILTER);
  const [typed, setTyped] = useState('');
  const [data, setData] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<HistoryItem | null>(null);
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [timelineError, setTimelineError] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilter((current) => ({ ...current, query: typed, page: 1 })), 350);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      try {
        const page = await apiJson<HistoryPage>(`/api/historial/envios?${historyQuery(filter, PAGE_SIZE)}`, { signal });
        setData(page);
        setError(null);
      } catch (failure) {
        if (signal.aborted) return;
        setError(failure instanceof ApiRequestError && failure.message ? failure.message : '');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setEvents(null);
    setTimelineError(false);
    apiJson<{ events: TimelineEvent[] }>(`/api/historial/envios/${opened.id}/eventos`, { signal: controller.signal })
      .then((body) => setEvents(body.events))
      .catch(() => {
        if (!controller.signal.aborted) setTimelineError(true);
      });
    return () => controller.abort();
  }, [opened]);

  const update = (patch: Partial<HistoryFilter>): void =>
    setFilter((current) => ({ ...current, ...patch, page: 1 }));
  const pages = data ? pageCount(data.total, data.pageSize) : 1;
  const statusLabel = (status: string): string => {
    const key = `history.status.${status}` as MessageKey;
    return t(key) === key ? status : t(key);
  };
  const eventLabel = (type: string): string => {
    const key = `history.event.${type}` as MessageKey;
    return t(key) === key ? type : t(key);
  };
  const actorLabel = (actor: string | null): string => {
    if (!actor) return '';
    const key = `history.actor.${actor}` as MessageKey;
    return t(key) === key ? actor : t(key);
  };

  return (
    <AppShell active="history">
      <SessionChangeNotice role="dispatcher" />
      <main className="rl-page">
        <header className="rl-page-head">
          <div>
            <h1>{t('history.title')}</h1>
            <p>{t('history.lead')}</p>
          </div>
        </header>

        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(event) => event.preventDefault()}>
          <label className="rp-field-label">
            {t('history.from')}
            <input className="rp-input mt-1.5 px-3 text-[15px] font-normal tabular-nums" max={filter.to || undefined}
              onChange={(event) => update({ from: event.target.value })} type="date" value={filter.from} />
          </label>
          <label className="rp-field-label">
            {t('history.to')}
            <input className="rp-input mt-1.5 px-3 text-[15px] font-normal tabular-nums" min={filter.from || undefined}
              onChange={(event) => update({ to: event.target.value })} type="date" value={filter.to} />
          </label>
          <label className="rp-field-label">
            {t('history.status')}
            <select className="rp-input mt-1.5 px-3 text-[15px] font-normal"
              onChange={(event) => update({ status: event.target.value })} value={filter.status}>
              <option value="">{t('history.statusAll')}</option>
              {HISTORY_STATUSES.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </select>
          </label>
          <label className="rp-field-label sm:col-span-2 lg:col-span-2">
            {t('history.search')}
            <input className="rp-input mt-1.5 px-3 text-[15px] font-normal" maxLength={80}
              onChange={(event) => setTyped(event.target.value)} placeholder={t('history.search.placeholder')}
              value={typed} />
