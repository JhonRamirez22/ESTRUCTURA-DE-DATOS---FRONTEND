/** HTTP del mismo origen: la cookie HttpOnly viaja sin exponerse a JavaScript. */
const API_TIMEOUT_MS = 15_000;
const SESSION_ROLE_HEADER = 'X-Session-Role';
const SESSION_CHANNEL = 'rutas-pasto-session';

export type SessionRole = 'dispatcher' | 'courier';
export type SessionChange = { role: SessionRole | 'all'; kind: 'login' | 'logout' };

/** Rol de la pestaña: cada rol tiene su cookie, así que la pestaña debe indicarlo. */
let sessionRole: SessionRole | null = null;
let csrfProof: { role: SessionRole | null; value: string } | null = null;
/** Token de acceso por rol: solo en memoria (nunca en localStorage); la cookie HttpOnly es el respaldo. */
const accessTokens: Partial<Record<SessionRole, string>> = {};

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly requestId: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/** Fija el rol que usa esta pestaña; un cambio descarta la prueba CSRF del rol anterior. */
export function setSessionRole(role: SessionRole | null): void {
  sessionRole = role;
  if (csrfProof && csrfProof.role !== role) csrfProof = null;
}

/** Avisa a otras pestañas del navegador cuando cambia una sesión (no se notifica a sí misma). */
export function onSessionChange(listener: (change: SessionChange) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.onmessage = (event: MessageEvent<SessionChange>) => listener(event.data);
  return () => channel.close();
}

function announceSessionChange(change: SessionChange): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.postMessage(change);
  channel.close();
}

/** No expone HTML de proxies ni detalles internos de excepciones del servidor. */
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  const requestId = response.headers.get('X-Request-ID') ?? crypto.randomUUID();
  if (!response.ok) {
    const message = response.status === 401
      ? 'La sesión expiró. Vuelve a ingresar.'
      : response.status === 403
        ? 'No tienes permiso para esta operación.'
        : response.status === 409
          ? 'Los datos cambiaron. Actualiza antes de continuar.'
          : response.status === 429
            ? 'Se alcanzó el límite de consultas. Espera antes de reintentar.'
            : 'El servicio no está disponible temporalmente.';
    throw new ApiRequestError(message, requestId, response.status);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new ApiRequestError('El servicio devolvió una respuesta inválida.', requestId, response.status);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/') || path.startsWith('//')) {
    throw new Error('El cliente HTTP solo admite rutas internas /api/.');
  }
  const url = path.startsWith('/api/v1/') ? path : path.replace('/api/', '/api/v1/');
  const method = (init.method ?? 'GET').toUpperCase();
  const requestId = crypto.randomUUID();
  const signal = init.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(API_TIMEOUT_MS)])
    : AbortSignal.timeout(API_TIMEOUT_MS);
  const headers = new Headers(init.headers);
