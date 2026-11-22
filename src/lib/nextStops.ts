/** Which stop each route does next, and which route is the one being done right now. */

export interface NextStopInfo {
  routeId: string;
  stopId: string;
  /** Minutes to get there when the server measured it; null when estimated on the client. */
  etaMinutes: number | null;
  /** True for the single closest next stop of the whole fleet. */
  focus: boolean;
}

export type NextStopRole = 'focus-next' | 'next';

interface RouteLike {
  id: string;
  courier: { currentLat: number | null; currentLng: number | null };
  deliveryPoints: Array<{
    id: string;
    lat: number;
    lng: number;
    sequenceIndex: number | null;
    status?: 'PENDING' | 'EN_ROUTE' | 'DELIVERED' | 'FAILED';
  }>;
}

interface LiveNext {
  nextStops?: Array<{ routeId: string; stopId: string; etaMinutes: number; focus: boolean }>;
  focusRouteId?: string | null;
}

const isOpen = (status: string | undefined): boolean => status !== 'DELIVERED' && status !== 'FAILED';

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * The first open stop of every route. The server's road-time figures win when they match the
 * routes on screen; otherwise the closest by straight line is used and no minutes are claimed.
 */
export function computeNextStops(routes: readonly RouteLike[], live?: LiveNext | null): NextStopInfo[] {
  const measured = new Map((live?.nextStops ?? []).map((item) => [item.routeId, item]));
  const found: Array<{ routeId: string; stopId: string; eta: number | null; meters: number }> = [];
  for (const route of routes) {
    const open = route.deliveryPoints
      .filter((point) => isOpen(point.status))
      .sort((a, b) => (a.sequenceIndex ?? 0) - (b.sequenceIndex ?? 0));
    const first = open[0];
    if (!first) continue;
    const server = measured.get(route.id);
    const here = route.courier;
    const meters =
      here.currentLat !== null && here.currentLng !== null
        ? metersBetween(here.currentLat, here.currentLng, first.lat, first.lng)
        : Number.POSITIVE_INFINITY;
    found.push({
      routeId: route.id,
      stopId: first.id,
      eta: server && server.stopId === first.id ? server.etaMinutes : null,
      meters,
    });
  }
  if (found.length === 0) return [];
  const serverFocus = live?.focusRouteId && found.some((item) => item.routeId === live.focusRouteId)
    ? live.focusRouteId
    : null;
  const closest = [...found].sort((a, b) => a.meters - b.meters)[0]!;
  const focusId = serverFocus ?? closest.routeId;
  return found.map((item) => ({
    routeId: item.routeId,
    stopId: item.stopId,
    etaMinutes: item.eta,
    focus: item.routeId === focusId,
  }));
}

export function nextStopRoles(infos: readonly NextStopInfo[]): Map<string, NextStopRole> {
  return new Map(infos.map((info) => [info.stopId, info.focus ? 'focus-next' : 'next']));
}

export function activeRouteId(infos: readonly NextStopInfo[]): string | null {
  return infos.find((info) => info.focus)?.routeId ?? null;
}
