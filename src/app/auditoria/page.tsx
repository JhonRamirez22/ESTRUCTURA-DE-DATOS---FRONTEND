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
