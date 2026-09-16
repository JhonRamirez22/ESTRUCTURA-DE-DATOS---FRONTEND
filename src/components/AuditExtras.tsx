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
