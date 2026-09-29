import { PASTO_SERVICE_BOUNDS } from './pastoArea';

/** Evita que el viewport salga del área de Pasto al alejar el mapa. */
export function getPastoMinimumZoom(width: number, height: number): number {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0)) return 11;
  const bounds = PASTO_SERVICE_BOUNDS;
  const mercator = (lat: number) => Math.asinh(Math.tan((lat * Math.PI) / 180)) / (2 * Math.PI);
  const horizontalSpan = (bounds.maxLongitude - bounds.minLongitude) / 360;
  const verticalSpan = mercator(bounds.maxLatitude) - mercator(bounds.minLatitude);
  return Math.min(
    18,
    Math.max(11, Math.log2(Math.max(width / (256 * horizontalSpan), height / (256 * verticalSpan))))
  );
}
