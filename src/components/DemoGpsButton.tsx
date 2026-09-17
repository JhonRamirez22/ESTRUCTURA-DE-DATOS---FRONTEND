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
