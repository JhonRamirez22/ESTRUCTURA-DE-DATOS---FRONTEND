'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { usePreferences } from '@/lib/preferences';
import { SessionChangeNotice } from '@/components/SessionChangeNotice';
import DemoGpsButton from '@/components/DemoGpsButton';
import PasswordChangeForm from '@/components/PasswordChangeForm';
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

/** Personal: alta y baja de repartidores con su acceso, y cambio de credenciales del equipo. */
export default function StaffPage() {
  const { t } = usePreferences();
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
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<{ courierId: string; message: string } | null>(null);

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

  const deleteCourier = async (courier: Courier): Promise<void> => {
    setDeletingId(courier.id);
    setDeleteError(null);
    setNotice(null);
    try {
      const response = await apiFetch(`/api/repartidores/${encodeURIComponent(courier.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const message =
          response.status === 409
            ? `${courier.name} tiene rutas en su historial; se conserva para no perder ese registro.`
            : await readApiError(response, 'No se pudo eliminar el repartidor.');
        throw new Error(message);
      }
      setConfirmingDeleteId(null);
      if (access?.courierId === courier.id) setAccess(null);
      setNotice(`${courier.name} fue eliminado y su cuenta ya no puede ingresar.`);
      await loadCouriers();
    } catch (error) {
      setConfirmingDeleteId(null);
      setDeleteError({
        courierId: courier.id,
        message: error instanceof Error ? error.message : 'No se pudo eliminar el repartidor.',
      });
    } finally {
      setDeletingId(null);
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
            <h1>{t('staff.title')}</h1>
            <p>{t('staff.lead')}</p>
          </div>
          <dl className="rl-figures">
            <div>
              <dt>{t('staff.team')}</dt>
              <dd>{couriers.length}</dd>
            </div>
            <div>
              <dt>{t('staff.gps')}</dt>
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
              <h2 id="team-heading">{t('staff.couriers')}</h2>
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
                  const confirming = confirmingDeleteId === courier.id;
                  const rowError = deleteError?.courierId === courier.id ? deleteError.message : null;
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
                        <div className="flex items-center gap-2">
                          <button
                            aria-expanded={editing}
                            className="rp-button rp-button-quiet rp-button-small"
                            data-tip="tip.changeAccess"
                            onClick={() => {
                              setAccessError(null);
                              setConfirmingDeleteId(null);
                              setAccess(editing ? null : { courierId: courier.id, email: '', password: '' });
                            }}
                            type="button"
                          >
                            {editing ? t('staff.cancel') : t('staff.changeAccess')}
                          </button>
                          {/* La acción destructiva queda separada y pide una segunda confirmación. */}
                          <button
                            aria-expanded={confirming}
                            aria-label={`Eliminar a ${courier.name}`}
                            className="rp-button rp-button-danger rp-button-small ml-3"
                            data-tip="tip.deleteCourier"
                            disabled={deletingId !== null}
                            onClick={() => {
