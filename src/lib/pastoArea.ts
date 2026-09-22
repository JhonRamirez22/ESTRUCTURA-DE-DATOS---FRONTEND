export const PASTO_SERVICE_BOUNDS = {
  minLatitude: 1.16,
  maxLatitude: 1.30,
  minLongitude: -77.36,
  maxLongitude: -77.20,
} as const;

const ADDRESS_SEPARATOR = " # ";

/** Validación de interfaz; el backend Python repite esta regla como autoridad. */
export function isWithinPastoServiceArea(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= PASTO_SERVICE_BOUNDS.minLatitude &&
    latitude <= PASTO_SERVICE_BOUNDS.maxLatitude &&
    longitude >= PASTO_SERVICE_BOUNDS.minLongitude &&
    longitude <= PASTO_SERVICE_BOUNDS.maxLongitude
  );
}

/** Normaliza abreviaturas visualmente sin geocodificar ni inventar coordenadas. */
export function normalizePastoAddress(address: string): string {
  let normalized = address.trim().replace(/\s+/g, " ");

  const replacements: Array<[RegExp, string]> = [
    [/\b(?:av|avda|avenida)\.?(?=\s|#|$)/gi, "Avenida"],
    [/\b(?:cra|carr|cr|carrera)\.?(?=\s|#|$)/gi, "Carrera"],
    [/\b(?:cll|cl|cal|calle)\.?(?=\s|#|$)/gi, "Calle"],
    [/\b(?:tr|transv|transversal)\.?(?=\s|#|$)/gi, "Transversal"],
