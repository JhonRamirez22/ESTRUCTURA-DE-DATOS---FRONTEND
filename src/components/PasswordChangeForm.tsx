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
