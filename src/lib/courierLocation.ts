export const COURIER_LOCATION_MAX_AGE_MS = 2 * 60 * 1_000;

/** La interfaz oculta posiciones GPS antiguas; FastAPI valida la frescura de nuevo. */
export function isCourierLocationFresh(
  lastLocationAt: Date | null,
  now: Date = new Date(),
): boolean {
