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
