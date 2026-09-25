'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiJson } from '@/lib/apiClient';
import {
  GENERAL_REPORTS,
  bogotaDate,
  fileNameFrom,
  generalReportUrl,
  periodProblem,
  type AuditLogEvent,
  type GeneralReportKind,
  type ReportDownload,
} from '@/lib/auditReport';
import { formatBogota } from '@/lib/history';
import type { MessageKey } from '@/lib/i18n';
import { usePreferences } from '@/lib/preferences';

const EVENT_TYPES = [
  'REQUESTED', 'CREATED', 'ACCEPTED', 'REJECTED', 'SCHEDULED', 'RESCHEDULED',
  'ASSIGNED', 'STARTED', 'DELIVERED', 'FAILED', 'RELEASED', 'DELETED',
] as const;

/** Informes generales de toda la operación (PDF) con el periodo elegido. */
export function GeneralReports() {
  const { t } = usePreferences();
  const [kind, setKind] = useState<GeneralReportKind>('summary');
  const [from, setFrom] = useState(() => bogotaDate(-7));
  const [to, setTo] = useState(() => bogotaDate());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const problem = periodProblem(from, to);

  const download = async (): Promise<void> => {
    if (problem !== null || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiFetch(generalReportUrl(kind, from, to));
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(response.status === 429 ? t('audit.tooMany') : (body?.error ?? t('audit.downloadError')));
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameFrom(response.headers.get('content-disposition'), 'informe.pdf');
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setMessage({ tone: 'ok', text: t('audit.downloaded') });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : t('audit.downloadError') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={t('audit.general.title')} className="mt-10 min-w-0">
      <div className="rl-head"><h2>{t('audit.general.title')}</h2></div>
      <p className="text-sm">{t('audit.general.lead')}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="rp-field-label">
          {t('audit.kind')}
          <select className="rp-input mt-1.5 px-3 text-[15px] font-normal" onChange={(event) => setKind(event.target.value as GeneralReportKind)} value={kind}>
            {GENERAL_REPORTS.map((item) => (
              <option key={item} value={item}>{t(`audit.general.${item}` as MessageKey)}</option>
            ))}
          </select>
        </label>
        <label className="rp-field-label">
          {t('audit.from')}
          <input className="rp-input mt-1.5 px-3 text-[15px] font-normal tabular-nums" max={to || undefined} onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
        </label>
        <label className="rp-field-label">
          {t('audit.to')}
