'use client';

import { apiJson } from '@/lib/apiClient';
import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/preferences';
import type { RouteOptimization } from '@/lib/routeOptimization';
import { useState } from 'react';

/**
 * Escalera de la optimización: cada mejora con sus minutos sobre la misma matriz.
 * La barra más larga es el orden base; cada peldaño muestra cuánto recortó.
 */
interface Explanation {
  text: string;
  source: 'groq-validated' | 'deterministic';
}

export default function OptimizationLadder({
  optimization,
  routeId,
}: {
  optimization: RouteOptimization;
  routeId: string;
}) {
  const t = useT();
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const explain = async (): Promise<void> => {
    setExplaining(true);
    setExplainError(null);
    try {
      setExplanation(
        await apiJson<Explanation>(`/api/inteligencia/rutas/${encodeURIComponent(routeId)}/explicar`, {
          method: 'POST',
