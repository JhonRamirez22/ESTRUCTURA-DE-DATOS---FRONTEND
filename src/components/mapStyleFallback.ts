export const KEYLESS_DARK_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export function isMapStyleAuthorizationError(event: unknown): boolean {
  if (typeof event !== "object" || event === null || !("error" in event)) {
    return false;
  }

  const error = event.error;
  const status =
    typeof error === "object" && error !== null && "status" in error
