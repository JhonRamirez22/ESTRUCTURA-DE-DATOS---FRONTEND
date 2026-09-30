export interface OrderBadgeInput {
  priority?: number;
  timeWindow?: { start?: string; end?: string } | null;
}

/** Partes cortas para la lista de pedidos: prioridad si no es normal y ventana horaria si existe. */
export function orderBadges(
  point: OrderBadgeInput,
  labels: { high: string; urgent: string },
): string[] {
  const parts: string[] = [];
  if (point.priority === 3) parts.push(labels.urgent);
  else if (point.priority === 2) parts.push(labels.high);
  const window = point.timeWindow;
  if (window && (window.start || window.end)) {
    parts.push(`${window.start ?? '…'}–${window.end ?? '…'}`);
  }
  return parts;
}
