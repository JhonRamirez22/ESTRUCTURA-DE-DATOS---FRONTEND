import { isWithinPastoServiceArea } from "@/lib/pastoArea";

export type MapCenter = [longitude: number, latitude: number];

const DEFAULT_PASTO_CENTER: MapCenter = [-77.2811, 1.2136];

/** Uses configured map defaults only when they remain inside the Pasto service area. */
export function getPastoMapCenter(
  latitudeValue: string | undefined,
  longitudeValue: string | undefined,
): MapCenter {
  if (!latitudeValue?.trim() || !longitudeValue?.trim()) {
