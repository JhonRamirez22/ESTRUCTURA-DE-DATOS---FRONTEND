const UUID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const UUID_IN_TEXT_PATTERN = /\b[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\b/gi;

/** Compacta UUIDs solo para mostrarlos; la referencia completa sigue en la base de datos. */
export function formatOrderReference(orderId: string): string {
  if (!UUID_PATTERN.test(orderId)) {
    return orderId;
  }
