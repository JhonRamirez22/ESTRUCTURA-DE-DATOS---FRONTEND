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
