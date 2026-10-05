'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { useT } from '@/lib/preferences';

const MIN_PASSWORD = 15;

/** Cambio de la propia contraseña: pide la actual y, al lograrlo, vuelve a pedir el ingreso. */
export default function PasswordChangeForm({ onChanged }: { onChanged?: () => void }) {
  const t = useT();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem =
    next.length > 0 && next.length < MIN_PASSWORD
      ? t('password.short', { n: MIN_PASSWORD })
      : confirm.length > 0 && confirm !== next
        ? t('password.mismatch')
        : next.length > 0 && next === current
          ? t('password.same')
          : null;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (problem || busy || !current || !next || confirm !== next) return;
    setBusy(true);
    setError(null);
    try {
      const response = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? t('password.error'));
        return;
      }
      setCurrent('');
      setNext('');
      setConfirm('');
      onChanged?.();
    } catch {
      setError(t('password.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="grid max-w-md gap-4" onSubmit={(event) => void submit(event)}>
      <label className="rp-field-label">
        {t('password.current')}
        <input autoComplete="current-password" className="rp-input mt-1.5 px-3 text-[15px] font-normal" onChange={(e) => setCurrent(e.target.value)} type="password" value={current} />
      </label>
      <label className="rp-field-label">
        {t('password.new')}
        <input autoComplete="new-password" className="rp-input mt-1.5 px-3 text-[15px] font-normal" maxLength={128} onChange={(e) => setNext(e.target.value)} type="password" value={next} />
      </label>
      <label className="rp-field-label">
        {t('password.confirm')}
        <input autoComplete="new-password" className="rp-input mt-1.5 px-3 text-[15px] font-normal" maxLength={128} onChange={(e) => setConfirm(e.target.value)} type="password" value={confirm} />
      </label>
      {problem ? <p className="rl-notice is-error" role="alert">{problem}</p> : null}
      {error ? <p className="rl-notice is-error" role="alert">{error}</p> : null}
      <button className="rp-button rp-button-primary" disabled={busy || !current || !next || confirm !== next || problem !== null} type="submit">
        {busy ? t('password.saving') : t('password.save')}
      </button>
      <p className="text-xs leading-5 text-[var(--ink-soft)]">{t('password.note')}</p>
    </form>
  );
}
