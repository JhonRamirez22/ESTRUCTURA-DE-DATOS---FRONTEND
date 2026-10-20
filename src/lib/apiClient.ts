/** HTTP del mismo origen: la cookie HttpOnly viaja sin exponerse a JavaScript. */
const API_TIMEOUT_MS = 15_000;
let csrfProof: string | null = null;

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
  try {
    if (staffMutation && !csrfProof) {
      const session = await fetch('/api/v1/auth/session', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      });
      csrfProof = session.headers.get('X-CSRF-Token');
      if (!session.ok || !csrfProof) {
        throw new ApiRequestError('La sesión expiró. Vuelve a ingresar.', requestId);
      }
    }
    headers.set('X-Request-ID', requestId);
    if (unsafe && csrfProof) headers.set('X-CSRF-Token', csrfProof);
    const response = await fetch(url, {
      ...init,
      headers,
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const proof = response.headers.get('X-CSRF-Token');
    if (proof) csrfProof = proof;
    if (response.status === 401 || url === '/api/v1/auth/logout') csrfProof = null;
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
