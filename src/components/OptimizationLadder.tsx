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
            : null;
          return (
            <li key={step.step} style={{ '--rung-delay': `${index * 70}ms` } as React.CSSProperties}>
              <span className="rl-ladder-label">
                {t(`opt.step.${step.step}` as MessageKey)}
                {status ? <span className="rl-ladder-status">{status}</span> : null}
              </span>
              <span className="rl-ladder-bar" aria-hidden="true">
                <i className={index === optimization.ladder.length - 1 ? 'is-final' : ''} style={{ width: `${width}%` }} />
              </span>
              <span className="rl-ladder-value">
                {step.minutes === null ? '—' : t('opt.minutes', { min: step.minutes.toLocaleString('es-CO') })}
              </span>
            </li>
          );
        })}
      </ol>
      {optimization.alternatives.length > 0 ? (
        <div className="mt-3">
          <p className="rl-ladder-title">{t('opt.alternatives')}</p>
          <ul className="mt-1 grid gap-1 text-xs text-[var(--ink-soft)]">
            {optimization.alternatives
              .filter((item) => item.step !== 'orOpt' || item.deltaMinutes !== 0)
              .map((item) => (
                <li key={item.step} className="flex justify-between gap-3">
                  <span>{t(`opt.step.${item.step}` as MessageKey)}</span>
                  <span className="tabular-nums">
                    {item.deltaMinutes !== null && item.deltaMinutes > 0.05
                      ? t('opt.alt.worse', { min: item.deltaMinutes.toLocaleString('es-CO') })
                      : '—'}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="rp-button rp-button-quiet rp-button-small"
          data-tip="tip.explainAi"
          disabled={explaining}
          onClick={() => void explain()}
          type="button"
        >
          {explaining ? t('opt.explaining') : t('opt.explain')}
        </button>
        {explainError ? <span className="text-xs text-[var(--danger-ink)]">{explainError}</span> : null}
      </div>
      {explanation ? (
        <div className="rl-notice is-ok mt-2 !block text-sm" role="status">
          <p>{explanation.text}</p>
          <p className="mt-1 text-xs">
            {explanation.source === 'groq-validated' ? t('opt.explainedBy') : t('opt.explainFallback')}
          </p>
        </div>
      ) : null}
      <p className="rl-ladder-note">
        {tomtom.sampled > 0
          ? t('opt.tomtom', { sampled: tomtom.sampled, segments: tomtom.segments, adjusted: tomtom.adjusted, closed })
          : t('opt.tomtom.off')}{' '}
        {groq.trafficApplied && groq.model ? t('opt.groq.traffic', { model: groq.model }) : null}{' '}
        {t('opt.sameMatrix')}
      </p>
    </section>
  );
}
