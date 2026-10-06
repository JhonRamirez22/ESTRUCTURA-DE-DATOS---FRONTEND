/** Contratos y utilidades del historial de envíos y de la entrega programada. */

export type ScheduleState = 'scheduled' | 'due-soon' | 'overdue';

export interface HistoryItem {
  id: string;
  orderId: string;
  address: string;
  status: string;
  courierName: string | null;
  createdAt: string | null;
  deliveredAt: string | null;
  scheduledFor: string | null;
  events: number;
  lastEventAt: string | null;
}

export interface HistoryPage {
  total: number;
  page: number;
  pageSize: number;
  items: HistoryItem[];
}

export interface TimelineEvent {
  type: string;
  at: string;
  fromStatus: string | null;
  toStatus: string | null;
  actor: string | null;
  courierName: string | null;
  detail: string | null;
}

export interface HistoryFilter {
  from: string;
  to: string;
  status: string;
  query: string;
  scheduledOnly: boolean;
  page: number;
}

export const EMPTY_FILTER: HistoryFilter = {
  from: '',
  to: '',
  status: '',
  query: '',
  scheduledOnly: false,
  page: 1,
};

export const HISTORY_STATUSES = ['REQUESTED', 'PENDING', 'EN_ROUTE', 'DELIVERED', 'FAILED'] as const;

/** Parámetros del servidor para una búsqueda; omite lo vacío. */
export function historyQuery(filter: HistoryFilter, pageSize = 25): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('desde', filter.from);
  if (filter.to) params.set('hasta', filter.to);
  if (filter.status) params.set('estado', filter.status);
  if (filter.query.trim()) params.set('q', filter.query.trim());
  if (filter.scheduledOnly) params.set('programados', 'true');
  params.set('pagina', String(Math.max(1, filter.page)));
  params.set('tamano', String(pageSize));
  return params.toString();
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** «21 nov., 3:05 p. m.» en hora de Bogotá, sin depender de la zona del navegador. */
export function formatBogota(iso: string | null | undefined, lang: 'es' | 'en' = 'es'): string {
  if (!iso) return '—';
  const moment = new Date(iso);
  if (Number.isNaN(moment.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-CO' : 'en-US', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(moment);
}

/** Valor de `<input type="datetime-local">` (hora de Bogotá) para el servidor; vacío = sin programar. */
export function scheduleToPayload(local: string): string | null {
  const value = local.trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? value : null;
}

/** Mínimo y máximo permitidos por el servidor para el selector (hora local de Bogotá). */
export function scheduleBounds(now: Date = new Date()): { min: string; max: string } {
  const toLocal = (offsetDays: number): string =>
    new Date(now.getTime() - 5 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 16);
  return { min: toLocal(0), max: toLocal(60) };
}

interface Schedulable {
