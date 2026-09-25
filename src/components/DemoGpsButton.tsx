'use client';

import { useEffect, useState } from 'react';
import { apiFetch, apiJson } from '@/lib/apiClient';
import { useT } from '@/lib/preferences';

/** Solo aparece con el modo demo activo: renueva el GPS de los repartidores de demostración. */
export default function DemoGpsButton({ onRenewed }: { onRenewed?: () => void }) {
  const t = useT();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiJson<{ enabled: boolean }>('/api/demo/estado', { signal: controller.signal })
      .then((status) => setEnabled(status.enabled))
      .catch(() => setEnabled(false));
    return () => controller.abort();
  }, []);

  if (!enabled) return null;

  const renew = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiFetch('/api/demo/renovar-gps', { method: 'POST' });
      if (!response.ok) throw new Error('failed');
      const result = (await response.json()) as { renewed: number };
      setMessage(t('demo.gps.done', { n: result.renewed }));
      onRenewed?.();
