'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { AuditLog, GeneralReports } from '@/components/AuditExtras';
import { SessionChangeNotice } from '@/components/SessionChangeNotice';
import { apiFetch, apiJson, ApiRequestError } from '@/lib/apiClient';
import {
  bogotaDate,
  fileNameFrom,
  periodProblem,
  reportUrl,
  type AuditKind,
  type AuditSubject,
} from '@/lib/auditReport';
import { usePreferences } from '@/lib/preferences';

const KINDS: ReadonlyArray<{ kind: AuditKind; label: 'audit.kind.courier' | 'audit.kind.account' | 'audit.kind.order' }> = [
  { kind: 'courier', label: 'audit.kind.courier' },
  { kind: 'account', label: 'audit.kind.account' },
  { kind: 'order', label: 'audit.kind.order' },
];

/** Auditoría de datos: el despacho elige a quién auditar y descarga el informe en PDF. */
export default function AuditPage() {
  const { t } = usePreferences();
  const [kind, setKind] = useState<AuditKind>('courier');
  const [query, setQuery] = useState('');
  const [subjects, setSubjects] = useState<AuditSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditSubject | null>(null);
  const [from, setFrom] = useState(() => bogotaDate(-30));
  const [to, setTo] = useState(() => bogotaDate());
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const search = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ tipo: kind, q: query.trim() });
        const data = await apiJson<{ subjects: AuditSubject[] }>(
          `/api/auditoria/sujetos?${params.toString()}`,
          { signal },
        );
        setSubjects(data.subjects);
        setSearchError(null);
      } catch (error) {
        if (signal.aborted) return;
        setSearchError(error instanceof ApiRequestError ? error.message : '');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [kind, query],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void search(controller.signal), query ? 300 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, query]);

  const problem = periodProblem(from, to);
  const problemText =
    problem === 'order' ? t('audit.period.order') : problem === 'long' ? t('audit.period.long') : null;

  const download = async (): Promise<void> => {
    if (!selected || problem !== null || downloading) return;
    setDownloading(true);
    setMessage(null);
    try {
      const response = await apiFetch(reportUrl(kind, selected.id, from, to));
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(
          response.status === 429 ? t('audit.tooMany') : (body?.error ?? t('audit.downloadError')),
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameFrom(response.headers.get('content-disposition'), 'auditoria.pdf');
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage({ tone: 'ok', text: t('audit.downloaded') });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : t('audit.downloadError') });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <AppShell active="audit">
      <SessionChangeNotice role="dispatcher" />
      <main className="rl-page">
        <header className="rl-page-head">
          <div>
            <h1>{t('audit.title')}</h1>
            <p>{t('audit.lead')}</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section aria-label={t('audit.pick')} className="min-w-0">
            <div className="rl-head">
              <h2>{t('audit.pick')}</h2>
            </div>
            <div aria-label={t('audit.kind')} className="flex flex-wrap gap-2" role="group">
              {KINDS.map((item) => (
                <button
                  aria-pressed={kind === item.kind}
                  className={`rp-button rp-button-small ${kind === item.kind ? 'rp-button-secondary' : 'rp-button-quiet'}`}
                  key={item.kind}
                  onClick={() => {
                    setKind(item.kind);
                    setSelected(null);
                    setQuery('');
                    setMessage(null);
                  }}
                  type="button"
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
            <label className="rp-field-label mt-4 block">
              {t('audit.search')}
              <input
                className="rp-input mt-1.5 px-3 text-[15px] font-normal"
                maxLength={80}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('audit.search.placeholder')}
                value={query}
              />
            </label>
            {searchError !== null ? <p className="rl-notice is-error mt-3" role="alert">{searchError || t('audit.searchError')}</p> : null}
            <ul className="rl-rows mt-3" aria-busy={loading}>
              {subjects.map((subject) => (
                <li className="rl-row" key={subject.id}>
                  <span className="rl-row-main">
                    <strong className="truncate">{subject.label}</strong>
                    <span className="truncate">{subject.detail}</span>
                  </span>
                  <button
                    aria-pressed={selected?.id === subject.id}
                    className={`rp-button rp-button-small ${selected?.id === subject.id ? 'rp-button-go' : 'rp-button-secondary'}`}
                    onClick={() => {
                      setSelected(subject);
                      setMessage(null);
                    }}
                    type="button"
                  >
                    {selected?.id === subject.id ? t('audit.selected') : t('audit.select')}
                  </button>
                </li>
              ))}
              {!loading && subjects.length === 0 && searchError === null ? (
                <li className="rl-empty">{t('audit.none')}</li>
              ) : null}
            </ul>
          </section>

          <section aria-label={t('audit.report')} className="min-w-0">
            <div className="rl-head">
              <h2>{t('audit.report')}</h2>
            </div>
            <p className="text-sm" aria-live="polite">
              {selected ? (
                <>
                  <span className="font-semibold">{t('audit.subject')}: </span>
                  {selected.label}
                </>
              ) : (
                t('audit.chooseFirst')
              )}
