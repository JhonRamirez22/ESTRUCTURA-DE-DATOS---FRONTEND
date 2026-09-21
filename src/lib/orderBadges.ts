export interface OrderBadgeInput {
  priority?: number;
  timeWindow?: { start?: string; end?: string } | null;
}

/** Partes cortas para la lista de pedidos: prioridad si no es normal y ventana horaria si existe. */
export function orderBadges(
  point: OrderBadgeInput,
  labels: { high: string; urgent: string },
): string[] {
