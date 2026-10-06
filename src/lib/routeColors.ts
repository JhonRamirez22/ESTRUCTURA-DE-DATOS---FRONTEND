/** Distinct, colour-blind-friendly line colours for the dark map (no red/orange: those mean traffic). */
export const ROUTE_PALETTE = [
  '#55f26b', // green
  '#38bdf8', // sky
  '#c084fc', // violet
  '#f472b6', // pink
  '#2dd4bf', // teal
  '#fde047', // yellow
  '#818cf8', // indigo
  '#a3e635', // lime
] as const;

/**
 * Gives every route its own colour and keeps it while the route exists, so a colour never
 * jumps to another courier when a route finishes or a new one appears.
 */
export class RouteColorAssigner {
  private readonly assigned = new Map<string, number>();

  assign(routeIds: readonly string[]): Record<string, string> {
    const alive = new Set(routeIds);
    for (const id of [...this.assigned.keys()]) {
      if (!alive.has(id)) this.assigned.delete(id);
    }
    const used = new Set(this.assigned.values());
    for (const id of routeIds) {
      if (this.assigned.has(id)) continue;
      let slot = 0;
      while (used.has(slot) && slot < ROUTE_PALETTE.length) slot += 1;
      // With more routes than colours the palette repeats, but never next to the same index.
      const index = slot < ROUTE_PALETTE.length ? slot : this.assigned.size % ROUTE_PALETTE.length;
      this.assigned.set(id, index);
      used.add(index);
    }
    return Object.fromEntries(
      routeIds.map((id) => [id, ROUTE_PALETTE[this.assigned.get(id) ?? 0] as string]),
    );
  }
}
