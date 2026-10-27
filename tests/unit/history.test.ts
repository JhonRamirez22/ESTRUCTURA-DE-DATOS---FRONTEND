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

