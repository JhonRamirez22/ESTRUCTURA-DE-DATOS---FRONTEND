'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { SessionChangeNotice } from '@/components/SessionChangeNotice';
import { apiFetch, apiJson, ApiRequestError } from '@/lib/apiClient';
import { isCourierLocationFresh } from '@/lib/courierLocation';

type CourierStatus = 'AVAILABLE' | 'ON_ROUTE' | 'OFFLINE';

interface Courier {
  id: string;
  name: string;
  phone: string;
  status: CourierStatus;
  lastLocationAt: string | null;
}

interface CourierDraft {
  name: string;
  phone: string;
  email: string;
  password: string;
}

interface AccessDraft {
  courierId: string;
  email: string;
  password: string;
}

const EMPTY_DRAFT: CourierDraft = { name: '', phone: '', email: '', password: '' };
const MIN_PASSWORD = 15;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Personal: alta de repartidores con su acceso y cambio de credenciales del equipo. */
export default function StaffPage() {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CourierDraft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessDraft | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const loadCouriers = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await apiJson<{ couriers: Courier[] }>('/api/repartidores', { signal });
      setCouriers([...data.couriers].sort((a, b) => a.name.localeCompare(b.name, 'es')));
      setLoadError(null);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(
        error instanceof ApiRequestError ? error.message : 'No se pudo cargar el equipo.'
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadCouriers(controller.signal);
    return () => controller.abort();
  }, [loadCouriers]);

  const createCourier = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const name = draft.name.trim();
    const phone = draft.phone.trim();
    const email = draft.email.trim().toLowerCase();
    const problem = validateCourier(name, phone, email, draft.password);
    if (problem) {
      setFormError(problem);
      return;
    }
    setCreating(true);
    setFormError(null);
    setNotice(null);
    try {
      const response = await apiFetch('/api/repartidores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, account: { email, password: draft.password } }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo registrar el repartidor.'));
      }
      setDraft(EMPTY_DRAFT);
      setNotice(`${name} ya puede ingresar con ${email} y activar su GPS desde el teléfono.`);
      await loadCouriers();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo registrar el repartidor.');
    } finally {
      setCreating(false);
    }
  };

  const saveAccess = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!access) return;
    const email = access.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      setAccessError('Escribe un correo válido, por ejemplo nombre@empresa.com.');
      return;
    }
    if (access.password.length < MIN_PASSWORD) {
      setAccessError(`La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    setSavingAccess(true);
    setAccessError(null);
    try {
      const response = await apiFetch('/api/auth/courier-account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courierId: access.courierId, email, password: access.password }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo guardar el acceso.'));
      }
      const courierName = couriers.find((courier) => courier.id === access.courierId)?.name;
      setAccess(null);
      setNotice(`Acceso actualizado para ${courierName ?? 'el repartidor'}.`);
    } catch (error) {
      setAccessError(error instanceof Error ? error.message : 'No se pudo guardar el acceso.');
    } finally {
      setSavingAccess(false);
    }
  };

  const connected = couriers.filter(
    (courier) => courier.status !== 'OFFLINE' && isFresh(courier.lastLocationAt)
  ).length;

  return (
    <AppShell active="team">
      <SessionChangeNotice role="dispatcher" />
      <main className="rl-page">
        <header className="rl-page-head">
          <div>
            <h1>Personal</h1>
            <p>Registra repartidores y administra su acceso a la aplicación.</p>
          </div>
          <dl className="rl-figures">
            <div>
              <dt>en el equipo</dt>
              <dd>{couriers.length}</dd>
            </div>
            <div>
              <dt>con GPS reciente</dt>
              <dd className="is-route">{connected}</dd>
            </div>
          </dl>
        </header>

        {notice ? (
          <p
            className="rl-notice is-ok feed-enter mb-6"
            role="status"
          >
            {notice}
          </p>
        ) : null}

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section
            aria-labelledby="team-heading"
            className="rl-section"
          >
            <div className="rl-head">
              <h2 id="team-heading">Repartidores</h2>
            </div>
            {loading ? (
              <p className="rl-empty" role="status">
                Cargando equipo…
              </p>
            ) : loadError ? (
              <div className="rl-notice is-error mt-4" role="alert">
                <span>{loadError}</span>
                <button
                  className="rp-button rp-button-quiet rp-button-small"
                  onClick={() => {
                    setLoading(true);
                    void loadCouriers();
                  }}
                  type="button"
                >
                  Reintentar
                </button>
              </div>
            ) : couriers.length === 0 ? (
              <p className="rl-empty">
                Todavía no hay repartidores. Registra el primero con el formulario.
              </p>
            ) : (
              <ul className="rl-rows">
                {couriers.map((courier) => {
                  const editing = access?.courierId === courier.id;
                  return (
                    <li className="border-b border-[var(--line)] py-3" key={courier.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                            {courier.name}
                          </p>
                          <p className="text-xs text-[var(--ink-soft)]">
                            <span className="tabular-nums">{courier.phone}</span> · {describeStatus(courier)}
                          </p>
                        </div>
                        <button
                          aria-expanded={editing}
                          className="rp-button rp-button-quiet rp-button-small"
                          onClick={() => {
                            setAccessError(null);
                            setAccess(editing ? null : { courierId: courier.id, email: '', password: '' });
                          }}
                          type="button"
                        >
                          {editing ? 'Cancelar' : 'Cambiar acceso'}
                        </button>
                      </div>
                      {editing && access ? (
                        <form
                          aria-label={`Acceso de ${courier.name}`}
                          className="route-proposal mt-3 grid gap-3 bg-[var(--band)] p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                          noValidate
                          onSubmit={(event) => void saveAccess(event)}
                        >
                          <label className="text-xs font-semibold text-[var(--foreground)]">
                            Correo
                            <input
                              autoComplete="off"
                              className="rp-input mt-1"
                              maxLength={254}
                              onChange={(event) => setAccess({ ...access, email: event.target.value })}
                              type="email"
                              value={access.email}
                            />
                          </label>
                          <label className="text-xs font-semibold text-[var(--foreground)]">
                            Nueva contraseña
                            <input
                              autoComplete="new-password"
                              className="rp-input mt-1"
                              maxLength={128}
                              onChange={(event) => setAccess({ ...access, password: event.target.value })}
                              type="password"
                              value={access.password}
                            />
                          </label>
                          <button className="rp-button rp-button-primary" disabled={savingAccess} type="submit">
                            {savingAccess ? 'Guardando…' : 'Guardar'}
                          </button>
                          {accessError ? (
                            <p className="rl-notice is-error sm:col-span-3" role="alert">
                              {accessError}
                            </p>
                          ) : null}
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="new-courier-heading"
            className="rl-section lg:sticky lg:top-20"
          >
            <div className="rl-head">
              <h2 id="new-courier-heading">Agregar repartidor</h2>
            </div>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">
              Se crea su cuenta: entra desde la página de acceso con este correo y contraseña.
            </p>
            <form className="mt-5 grid gap-5" noValidate onSubmit={(event) => void createCourier(event)}>
              <label className="rp-field-label">
                Nombre completo
                <input
                  autoComplete="off"
                  className="rp-input mt-1"
                  maxLength={100}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  placeholder="Ej. Camila Ramírez"
                  value={draft.name}
                />
              </label>
              <label className="rp-field-label">
                Teléfono
                <input
                  autoComplete="off"
                  className="rp-input mt-1"
                  inputMode="tel"
                  maxLength={20}
                  onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                  placeholder="Ej. 300 123 4567"
                  type="tel"
                  value={draft.phone}
                />
              </label>
              <label className="rp-field-label">
                Correo electrónico
                <input
                  autoComplete="off"
                  className="rp-input mt-1"
                  maxLength={254}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  placeholder="nombre@empresa.com"
                  type="email"
                  value={draft.email}
                />
              </label>
              <label className="rp-field-label">
                Contraseña
                <input
                  aria-describedby="new-courier-password-help"
                  autoComplete="new-password"
                  className="rp-input mt-1"
                  maxLength={128}
                  onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                  type="password"
                  value={draft.password}
                />
                <span className="rp-field-help" id="new-courier-password-help">
                  Mínimo {MIN_PASSWORD} caracteres. Entrégasela al repartidor en persona.
                </span>
              </label>
              {formError ? (
                <p className="rl-notice is-error" role="alert">
                  {formError}
                </p>
              ) : null}
              <button className="rp-button rp-button-primary rp-button-block mt-1" disabled={creating} type="submit">
                {creating ? 'Registrando…' : 'Registrar repartidor'}
              </button>
            </form>
          </section>
        </div>
      </main>
    </AppShell>
  );
}

function validateCourier(name: string, phone: string, email: string, password: string): string | null {
  if (!name) return 'Escribe el nombre del repartidor.';
  if (!/^[+\d][\d\s-]{6,19}$/.test(phone)) return 'Escribe un teléfono válido (solo números, espacios o guiones).';
  if (!EMAIL_PATTERN.test(email)) return 'Escribe un correo válido, por ejemplo nombre@empresa.com.';
  if (password.length < MIN_PASSWORD) return `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`;
  return null;
}

function isFresh(lastLocationAt: string | null): boolean {
  return isCourierLocationFresh(lastLocationAt ? new Date(lastLocationAt) : null);
}

function describeStatus(courier: Courier): string {
  if (isFresh(courier.lastLocationAt)) {
    if (courier.status === 'AVAILABLE') return 'Disponible';
    if (courier.status === 'ON_ROUTE') return 'En ruta';
    return 'Fuera de línea';
  }
  if (courier.lastLocationAt) {
    return `Sin GPS desde las ${new Date(courier.lastLocationAt).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }
  return 'Aún no ha compartido GPS';
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === 'string' ? payload.error : fallback;
  } catch {
    return fallback;
  }
}
