'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { useT } from '@/lib/preferences';

interface Proposal {
  changed: boolean;
  worthApplying?: boolean;
  improvementMinutes: number | null;
  baselineDurationMinutes?: number | null;
  estimatedDurationMinutes: number;
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'better'; proposal: Proposal }
  | { kind: 'same' }
  | { kind: 'error'; message: string };

/** El despachador pide revisar una ruta con el tráfico de ahora; solo se aplica si él acepta. */
export default function RouteImprovementCheck({
  routeId,
  canCheck,
  onApply,
}: {
  routeId: string;
  canCheck: boolean;
  onApply: (routeId: string) => Promise<void>;
}) {
  const t = useT();
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [applying, setApplying] = useState(false);

  if (!canCheck) return null;

  const check = async (): Promise<void> => {
    setState({ kind: 'checking' });
    try {
      const response = await apiFetch(`/api/rutas/${encodeURIComponent(routeId)}/propuesta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setState({ kind: 'error', message: body?.error ?? t('improve.error') });
        return;
      }
      const proposal = (await response.json()) as Proposal;
      setState((proposal.worthApplying ?? proposal.changed) ? { kind: 'better', proposal } : { kind: 'same' });
    } catch {
      setState({ kind: 'error', message: t('improve.error') });
    }
  };

  const apply = async (): Promise<void> => {
    setApplying(true);
    try {
      await onApply(routeId);
      setState({ kind: 'idle' });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="mt-3 text-sm">
      {state.kind === 'idle' || state.kind === 'same' || state.kind === 'error' ? (
        <button
          className="rp-button rp-button-quiet rp-button-small"
          onClick={() => void check()}
          type="button"
        >
          {t('improve.check')}
        </button>
      ) : null}
      {state.kind === 'checking' ? (
        <p aria-live="polite" role="status">{t('improve.checking')}</p>
      ) : null}
      {state.kind === 'same' ? (
        <p className="mt-2" role="status">{t('improve.same')}</p>
      ) : null}
      {state.kind === 'error' ? (
        <p className="rl-notice is-error mt-2" role="alert">{state.message}</p>
      ) : null}
