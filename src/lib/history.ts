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
