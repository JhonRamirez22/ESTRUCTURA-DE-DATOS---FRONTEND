import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTER,
  formatBogota,
  historyQuery,
  pageCount,
  queueOrder,
  scheduleBounds,
  scheduleToPayload,
  splitSchedule,
} from '@/lib/history';

describe('history', () => {
  it('arma la consulta sin campos vacíos y con página mínima 1', () => {
    expect(historyQuery(EMPTY_FILTER)).toBe('pagina=1&tamano=25');
    const query = historyQuery({
      ...EMPTY_FILTER, from: '2026-11-01', to: '2026-11-20', status: 'DELIVERED', query: ' RP-10 ',
      scheduledOnly: true, page: 0,
    });
    expect(query).toBe('desde=2026-11-01&hasta=2026-11-20&estado=DELIVERED&q=RP-10&programados=true&pagina=1&tamano=25');
  });

  it('cuenta páginas con al menos una', () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(26, 25)).toBe(2);
  });

  it('muestra la hora de Bogotá y tolera vacíos', () => {
    expect(formatBogota(null)).toBe('—');
    expect(formatBogota('no-fecha')).toBe('—');
    expect(formatBogota('2026-11-21T20:05:00Z', 'en')).toMatch(/3:05\s?PM/);
  });

  it('solo acepta datetime-local completo', () => {
    expect(scheduleToPayload('2026-11-25T15:00')).toBe('2026-11-25T15:00');
    expect(scheduleToPayload('')).toBeNull();
    expect(scheduleToPayload('2026-11-25')).toBeNull();
  });

  it('el rango del selector va de ahora a 60 días en hora de Bogotá', () => {
    const { min, max } = scheduleBounds(new Date('2026-11-22T03:00:00Z'));
    expect(min).toBe('2026-11-21T22:00');
    expect(max).toBe('2027-01-20T22:00');
  });
