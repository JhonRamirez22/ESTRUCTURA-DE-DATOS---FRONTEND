export type AuditKind = 'courier' | 'account' | 'order';

export interface AuditSubject {
  id: string;
  label: string;
  detail: string;
}

/** Fecha local (YYYY-MM-DD) de Bogotá, para que «hoy» coincida con el día de operación. */
export function bogotaDate(offsetDays = 0, now: Date = new Date()): string {
  const local = new Date(now.getTime() - 5 * 3600_000 + offsetDays * 86_400_000);
  return local.toISOString().slice(0, 10);
}

/** Valida el periodo del informe: orden correcto y menos de un año. Devuelve el problema o null. */
export function periodProblem(from: string, to: string): 'order' | 'long' | 'missing' | null {
  if (!from || !to) return 'missing';
  if (to < from) return 'order';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return days >= 366 ? 'long' : null;
}

export function reportUrl(kind: AuditKind, id: string, from: string, to: string): string {
  const params = new URLSearchParams({ tipo: kind, id, desde: from, hasta: to });
  return `/api/auditoria/informe?${params.toString()}`;
}

/** Nombre de archivo del servidor (sin datos personales); respaldo si falta la cabecera. */
export function fileNameFrom(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}
