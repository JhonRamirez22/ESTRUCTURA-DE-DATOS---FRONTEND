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
