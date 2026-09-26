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
        })
      );
    } catch (error) {
      setExplainError(error instanceof Error ? error.message : 'No se pudo explicar la ruta.');
    } finally {
      setExplaining(false);
    }
  };
  const longest = Math.max(...optimization.ladder.map((step) => step.minutes ?? 0), 1);
  const { tomtom, groq } = optimization;
  const closed = tomtom.closed > 0 ? t('opt.tomtom.closed', { n: tomtom.closed }) : '';
  return (
    <section aria-label={t('opt.title')} className="rl-ladder">
      <p className="rl-ladder-title">{t('opt.title')}</p>
      <ol>
        {optimization.ladder.map((step, index) => {
          const width = step.minutes === null ? 0 : Math.max(6, (step.minutes / longest) * 100);
          const isAi = step.step === 'aiOrder';
          const status = isAi
            ? step.accepted
              ? t('opt.ai.accepted')
              : step.proposed
                ? t('opt.ai.rejected')
                : t('opt.ai.off')
            : step.step === 'refine'
              ? refineStatus(step, t)
              : null;
          return (
            <li key={step.step} style={{ '--rung-delay': `${index * 70}ms` } as React.CSSProperties}>
              <span className="rl-ladder-label">
                {t(`opt.step.${step.step}` as MessageKey)}
                {status ? <span className="rl-ladder-status">{status}</span> : null}
              </span>
              <span className="rl-ladder-bar" aria-hidden="true">
                <i className={index === optimization.ladder.length - 1 ? 'is-final' : ''} style={{ width: `${width}%` }} />
