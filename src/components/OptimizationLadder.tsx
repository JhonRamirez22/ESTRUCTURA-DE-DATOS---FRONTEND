'use client';

import type { MessageKey } from '@/lib/i18n';
import { useT } from '@/lib/preferences';
import type { RouteOptimization } from '@/lib/routeOptimization';

/**
 * Escalera de la optimización: cada mejora con sus minutos sobre la misma matriz.
 * La barra más larga es el orden base; cada peldaño muestra cuánto recortó.
 */
export default function OptimizationLadder({ optimization }: { optimization: RouteOptimization }) {
  const t = useT();
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
