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
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const staffMutation = unsafe && !['/api/v1/auth/login', '/api/v1/cliente/chat'].includes(url);
  const role = sessionRole;
  if (role) headers.set(SESSION_ROLE_HEADER, role);
  const bearer = role ? accessTokens[role] : undefined;
  if (bearer && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${bearer}`);
  try {
    if (staffMutation && csrfProof?.role !== role) csrfProof = null;
    // Con token Bearer no hace falta prueba CSRF: no hay credencial ambiente.
    if (staffMutation && !bearer && !csrfProof) {
      const session = await fetch('/api/v1/auth/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: role ? { [SESSION_ROLE_HEADER]: role } : undefined,
        signal,
      });
      const proof = session.headers.get('X-CSRF-Token');
      if (!session.ok || !proof) {
        throw new ApiRequestError('La sesión expiró. Vuelve a ingresar.', requestId);
      }
      csrfProof = { role: (session.headers.get(SESSION_ROLE_HEADER) as SessionRole | null) ?? role, value: proof };
    }
    headers.set('X-Request-ID', requestId);
    if (unsafe && csrfProof) headers.set('X-CSRF-Token', csrfProof.value);
    const response = await fetch(url, {
      ...init,
      headers,
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const proof = response.headers.get('X-CSRF-Token');
    const responseRole = response.headers.get(SESSION_ROLE_HEADER) as SessionRole | null;
    if (proof) csrfProof = { role: responseRole ?? role, value: proof };
    if (response.status === 401 || url === '/api/v1/auth/logout') csrfProof = null;
    if (response.ok && url === '/api/v1/auth/login' && responseRole) {
      const token = await response.clone().json().then(
        (data: { accessToken?: unknown }) => (typeof data.accessToken === 'string' ? data.accessToken : null),
        () => null
      );
      if (token) accessTokens[responseRole] = token;
      announceSessionChange({ role: responseRole, kind: 'login' });
    }
    if (response.status === 401 && role) delete accessTokens[role];
    if (response.ok && url === '/api/v1/auth/logout') {
      if (role) delete accessTokens[role];
      else { delete accessTokens.dispatcher; delete accessTokens.courier; }
      announceSessionChange({ role: role ?? 'all', kind: 'logout' });
    }
    if (!response.ok && !response.headers.get('Content-Type')?.includes('application/json')) {
      return Response.json(
        {
          error: 'El servicio de acceso no respondió correctamente. Intenta nuevamente.',
          requestId: response.headers.get('X-Request-ID') ?? requestId,
        },
        { status: response.status, headers: { 'X-Request-ID': response.headers.get('X-Request-ID') ?? requestId } }
      );
    }
    return response;
  } catch (error) {
    if (init.signal?.aborted) throw error;
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(
      signal.aborted
        ? 'La petición tardó demasiado. Intenta nuevamente.'
        : 'No se pudo conectar con el servidor.',
      requestId
    );
  }
}
