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
