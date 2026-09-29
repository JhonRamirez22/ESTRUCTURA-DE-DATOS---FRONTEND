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
