import { describe, expect, it } from 'vitest';
import { bogotaDate, fileNameFrom, periodProblem, reportUrl } from '@/lib/auditReport';

describe('auditReport', () => {
  it('«hoy» es la fecha local de Bogotá, no la UTC', () => {
    const lateNightUtc = new Date('2026-11-21T02:09:00Z'); // 21:09 del 20 en Bogotá
    expect(bogotaDate(0, lateNightUtc)).toBe('2026-11-20');
    expect(bogotaDate(-30, lateNightUtc)).toBe('2026-10-21');
    expect(bogotaDate(0, new Date('2026-11-21T05:00:00Z'))).toBe('2026-11-21');
  });

  it('valida el periodo: orden, un año como máximo y campos vacíos', () => {
    expect(periodProblem('2026-11-01', '2026-11-20')).toBeNull();
    expect(periodProblem('2026-11-20', '2026-11-20')).toBeNull();
    expect(periodProblem('2026-11-20', '2026-11-01')).toBe('order');
    expect(periodProblem('2025-01-01', '2026-01-02')).toBe('long');
    expect(periodProblem('2025-01-01', '2026-01-01')).toBeNull();
    expect(periodProblem('', '2026-11-20')).toBe('missing');
  });

  it('arma la URL con el tipo, el id y las fechas codificados', () => {
    const url = reportUrl('order', 'a b', '2026-11-01', '2026-11-20');
    expect(url).toBe('/api/auditoria/informe?tipo=order&id=a+b&desde=2026-11-01&hasta=2026-11-20');
  });

  it('toma el nombre de archivo del servidor y tiene respaldo', () => {
    expect(fileNameFrom('attachment; filename="auditoria-courier-20261120.pdf"', 'x.pdf')).toBe('auditoria-courier-20261120.pdf');
    expect(fileNameFrom(null, 'auditoria.pdf')).toBe('auditoria.pdf');
  });
});
