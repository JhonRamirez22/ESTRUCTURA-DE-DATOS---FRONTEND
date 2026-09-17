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
