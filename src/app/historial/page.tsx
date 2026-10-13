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
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input checked={filter.scheduledOnly} className="h-[18px] w-[18px]"
              onChange={(event) => update({ scheduledOnly: event.target.checked })} type="checkbox" />
            {t('history.scheduledOnly')}
          </label>
          <button className="rp-button rp-button-quiet rp-button-small justify-self-start" onClick={() => { setTyped(''); setFilter(EMPTY_FILTER); }} type="button">
            {t('history.clear')}
          </button>
        </form>

        {error !== null ? <p className="rl-notice is-error mt-4" role="alert">{error || t('history.error')}</p> : null}
        <p aria-live="polite" className="mt-4 text-sm">{data ? t('history.total', { n: data.total }) : ''}</p>

        <div className="mt-2 grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <ul aria-busy={loading} className="rl-rows">
            {data?.items.map((item) => (
              <li className={`rl-row ${opened?.id === item.id ? 'is-selected' : ''}`} key={item.id}>
                <span className="rl-row-main">
                  <strong className="truncate">{item.address}</strong>
                  <span className="rl-ref">
                    {item.orderId} · {statusLabel(item.status)}
                    {item.courierName ? ` · ${item.courierName}` : ''}
                    {` · ${formatBogota(item.createdAt, lang)}`}
                    {item.scheduledFor ? ` · ${t('history.scheduled')} ${formatBogota(item.scheduledFor, lang)}` : ''}
                  </span>
                </span>
                <button aria-pressed={opened?.id === item.id} className="rp-button rp-button-secondary rp-button-small"
                  onClick={() => setOpened(item)} type="button">
                  {t('history.open')}
                </button>
              </li>
            ))}
            {!loading && data && data.items.length === 0 ? <li className="rl-empty">{t('history.none')}</li> : null}
          </ul>

          <section aria-label={t('history.timeline')} className="min-w-0">
            {opened ? (
              <>
                <div className="rl-head">
                  <h2>{t('history.timeline')} · {opened.orderId}</h2>
                  <button className="text-sm font-semibold underline-offset-4 hover:underline" onClick={() => setOpened(null)} type="button">
                    {t('history.close')}
                  </button>
                </div>
                {timelineError ? <p className="rl-notice is-error" role="alert">{t('history.timeline.error')}</p> : null}
                {events === null && !timelineError ? <div aria-busy="true" className="rp-skeleton h-24" /> : null}
                {events !== null && events.length === 0 ? <p className="rl-empty">{t('history.timeline.empty')}</p> : null}
                <ol className="grid gap-3">
                  {events?.map((entry, index) => (
                    <li className="rl-row" key={`${entry.type}-${entry.at}-${index}`}>
                      <span className="rl-row-main">
                        <strong>{eventLabel(entry.type)}</strong>
                        <span className="rl-ref">
                          {formatBogota(entry.at, lang)}
                          {entry.actor ? ` · ${actorLabel(entry.actor)}` : ''}
                          {entry.courierName ? ` · ${entry.courierName}` : ''}
                          {entry.detail ? ` · ${entry.detail}` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
          </section>
        </div>

        {data && pages > 1 ? (
          <nav aria-label={t('history.page', { page: filter.page, pages })} className="mt-4 flex items-center gap-3">
            <button className="rp-button rp-button-quiet rp-button-small" disabled={filter.page <= 1}
              onClick={() => setFilter((current) => ({ ...current, page: current.page - 1 }))} type="button">
              {t('history.prev')}
            </button>
            <span className="text-sm tabular-nums">{t('history.page', { page: filter.page, pages })}</span>
            <button className="rp-button rp-button-quiet rp-button-small" disabled={filter.page >= pages}
              onClick={() => setFilter((current) => ({ ...current, page: current.page + 1 }))} type="button">
              {t('history.next')}
            </button>
          </nav>
        ) : null}
      </main>
    </AppShell>
  );
}
