'use client';

import { apiFetch } from '@/lib/apiClient';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { formatOrderReference } from '@/lib/formatOrderReference';
import { buildCustomerEmailConsent } from '@/lib/customerEmailConsent';
import { buildCustomerSmsConsent } from '@/lib/customerSmsConsent';
import { isWithinPastoServiceArea, normalizePastoAddress } from '@/lib/pastoArea';
import type { MapDeliveryPoint } from '@/components/MapLibreRouteMap';

const OrderMap = dynamic(() => import('@/components/MapLibreRouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[460px] items-center justify-center bg-slate-900 text-sm text-slate-400">
      Cargando mapa de Pasto…
    </div>
  ),
});

interface OrderDraft {
  address: string;
  orderId: string;
  lat: string;
  lng: string;
  customerEmail: string;
  emailNotificationsEnabled: boolean;
  customerPhone: string;
  smsNotificationsEnabled: boolean;
}

interface AddressNormalizationStatus {
  source: 'external-ai' | 'deterministic';
  confidence?: number;
  warning?: string;
}

interface PendingOrderPoint extends MapDeliveryPoint {
  orderId: string;
}

interface AddressCandidate {
  address: string;
  lat: number;
  lng: number;
  precision: 'address' | 'intersection' | 'approximate';
}

export default function OrdersPage() {
  const [draft, setDraft] = useState<OrderDraft>({
    address: '',
    orderId: '',
    lat: '',
    lng: '',
    customerEmail: '',
    emailNotificationsEnabled: false,
    customerPhone: '',
    smsNotificationsEnabled: false,
  });
  const [pendingPoints, setPendingPoints] = useState<PendingOrderPoint[]>([]);
  const [selectedCoordinate, setSelectedCoordinate] = useState<[number, number] | null>(null);
  const [normalization, setNormalization] = useState<AddressNormalizationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<AddressCandidate[]>([]);
  const [addressNotice, setAddressNotice] = useState<string | null>(null);
  const [findingAddress, setFindingAddress] = useState(false);
  const lookupSequence = useRef(0);

  useEffect(() => {
    const sequence = ++lookupSequence.current;
    const controller = new AbortController();
    setCandidates([]);
    setAddressNotice(null);
    setFindingAddress(false);
    if (draft.address.trim().length < 3) return;
    const timer = window.setTimeout(() => {
      if (sequence !== lookupSequence.current) return;
      setFindingAddress(true);
      void (async () => {
        try {
          const response = await apiFetch('/api/v1/direcciones/resolver', {
            method: 'POST',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: draft.address }),
          });
          const payload = (await response.json()) as {
            candidates?: AddressCandidate[];
            warning?: string;
            error?: string;
            detail?: string;
          };
          if (controller.signal.aborted || sequence !== lookupSequence.current) return;
          if (!response.ok)
            throw new Error(
              payload.error ??
                (typeof payload.detail === 'string'
                  ? payload.detail
                  : 'No se pudo buscar la dirección.')
            );
          const suggestions = payload.candidates ?? [];
          setCandidates(suggestions);
          setAddressNotice(payload.warning ?? 'Confirma la ubicación sugerida antes de guardar.');
          if (suggestions.length === 1) {
            setSelectedCoordinate([suggestions[0]!.lat, suggestions[0]!.lng]);
          }
        } catch (cause) {
          if (controller.signal.aborted || sequence !== lookupSequence.current) return;
          setAddressNotice(
            cause instanceof Error ? cause.message : 'No se pudo buscar la dirección.'
          );
        } finally {
          if (sequence === lookupSequence.current) setFindingAddress(false);
        }
      })();
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft.address]);

  const confirmAddress = (candidate: AddressCandidate) => {
    ++lookupSequence.current;
    setFindingAddress(false);
    setSelectedCoordinate([candidate.lat, candidate.lng]);
    setDraft((current) => ({
      ...current, lat: candidate.lat.toFixed(6), lng: candidate.lng.toFixed(6),
    }));
    setAddressNotice(
      candidate.precision === 'address'
        ? 'Ubicación confirmada.'
        : 'Confirmaste una ubicación aproximada; revisa la referencia de entrega.'
    );
    setCandidates([]);
  };

  const loadPendingOrders = useCallback(async (): Promise<void> => {
    try {
      const response = await apiFetch('/api/pedidos?status=PENDING', { cache: 'no-store' });

      if (!response.ok) {
        throw new Error('No se pudieron cargar los pedidos pendientes.');
      }

      const payload = (await response.json()) as {
        deliveryPoints: Array<{
          id: string;
          orderId: string;
          address: string;
          lat: number;
          lng: number;
          status: 'PENDING';
        }>;
      };

      setPendingPoints(
        payload.deliveryPoints.map((point) => ({
          ...point,
          sequenceIndex: null,
        }))
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'No se pudieron cargar los pedidos.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendingOrders();
  }, [loadPendingOrders]);

  const handleMapClick = ({ lat, lng }: { lat: number; lng: number }) => {
    ++lookupSequence.current;
    setFindingAddress(false);
    setCandidates([]);
    setAddressNotice('Ubicación seleccionada manualmente.');
    setSelectedCoordinate([lat, lng]);
    setDraft((current) => ({
      ...current,
      lat: lat.toFixed(6),
      lng: lng.toFixed(6),
    }));
    setError(null);
    setSuccess(null);
  };

  const createOrder = async (): Promise<void> => {
    const lat = Number(draft.lat);
    const lng = Number(draft.lng);
    const emailConsent = buildCustomerEmailConsent(
      draft.customerEmail,
      draft.emailNotificationsEnabled
    );
    const smsConsent = buildCustomerSmsConsent(draft.customerPhone, draft.smsNotificationsEnabled);

    if (
      draft.address.trim() === '' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !isWithinPastoServiceArea(lat, lng)
    ) {
      setError(
        'Escribe la dirección y confirma una sugerencia o selecciona un punto dentro de Pasto.'
      );
      return;
    }
    if (emailConsent === null) {
      setError('Para activar los avisos, escribe un correo electrónico válido.');
      return;
    }
    if (smsConsent === null) {
      setError('Para activar los avisos por SMS, escribe un celular colombiano válido.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiFetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: normalizePastoAddress(draft.address),
          lat,
          lng,
          orderId: draft.orderId.trim() || `PED-${Date.now()}`,
          ...emailConsent,
          ...smsConsent,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo registrar el pedido.'));
      }

      const payload = (await response.json()) as {
        deliveryPoint: { orderId: string; address: string };
        trackingGuide: string;
        addressNormalization?: AddressNormalizationStatus;
      };
      setNormalization(payload.addressNormalization ?? null);
      setSuccess(
        `Pedido ${formatOrderReference(payload.deliveryPoint.orderId)} listo. Guía privada para el cliente: ${payload.trackingGuide}.${
          emailConsent.emailNotificationsEnabled || smsConsent.smsNotificationsEnabled
            ? ' La solicitud de avisos quedó guardada; su entrega depende de que el canal elegido esté configurado.'
            : ''
        }`
      );
      setDraft({
        address: '',
        orderId: '',
        lat: '',
        lng: '',
        customerEmail: '',
        emailNotificationsEnabled: false,
        customerPhone: '',
        smsNotificationsEnabled: false,
      });
      setSelectedCoordinate(null);
      await loadPendingOrders();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : 'No se pudo registrar el pedido.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell active="orders">
      <main className="rp-orders mx-auto max-w-[1600px] px-5 py-6 sm:px-8 lg:px-10">
        <section className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Registrar un pedido
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Cada pedido queda pendiente hasta que el despacho lo asigne a un repartidor.
              Normalizamos abreviaturas locales y validamos el punto exacto en el mapa.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-right ">
            <p className="text-2xl font-bold tabular-nums text-emerald-800">
              {pendingPoints.length}
            </p>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              pendientes
            </p>
          </div>
        </section>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {success ? <Alert tone="success">{success}</Alert> : null}
        {normalization ? (
          <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs text-teal-800">
            {normalization.source === 'external-ai'
              ? `La IA normalizó la dirección con ${Math.round((normalization.confidence ?? 0) * 100)}% de confianza.`
              : (normalization.warning ?? 'La dirección fue normalizada localmente.')}
          </div>
        ) : null}

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="rp-map-frame bg-slate-950">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">Pasto · selecciona una ubicación</h2>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-300">
                Solo Pasto
              </span>
            </div>
            <div className="h-[560px]">
              <OrderMap
                ariaLabel="Mapa para seleccionar la dirección del pedido"
                className="h-full w-full"
                couriers={[]}
                pendingPoints={pendingPoints}
                routes={[]}
                selectedCoordinate={selectedCoordinate}
                onMapClick={handleMapClick}
              />
            </div>
          </div>

          <div className="space-y-5">
            <section className="rp-order-form bg-[var(--surface)] p-5">
              <div>
                <h2 className="font-semibold text-slate-900">Datos del pedido</h2>
                <p className="mt-1 text-xs text-slate-600">
                  Normalizamos “num.”, “cra.” y otras abreviaturas locales de Pasto.
                </p>
              </div>
              <div className="mt-5 space-y-4">
                <label className="block text-xs font-semibold text-slate-600">
                  Dirección
                  <input
                    className="rp-input mt-1.5 px-3 py-3 text-sm font-normal"
                    onChange={(event) => {
                      ++lookupSequence.current;
                      setSelectedCoordinate(null);
                      setDraft((current) => ({
                        ...current,
                        address: event.target.value,
                        lat: '',
                        lng: '',
                      }));
                    }}
                    placeholder="Ej. Carrera 25 num 4 sur 65"
                    value={draft.address}
                  />
                </label>
                <div aria-live="polite" aria-busy={findingAddress}>
                  {findingAddress ? (
                    <p className="text-sm text-[var(--muted)]">Buscando solo en Pasto…</p>
                  ) : addressNotice ? (
                    <p className="text-sm text-[var(--muted)]">{addressNotice}</p>
                  ) : null}
                  {candidates.length > 0 ? (
                    <ul aria-label="Ubicaciones sugeridas" className="mt-3 space-y-2">
                      {candidates.map((candidate, index) => (
                        <li key={`${candidate.lat}:${candidate.lng}:${index}`}>
                          <button
                            type="button"
                            className="rp-button rp-button-secondary w-full text-left"
                            onClick={() => confirmAddress(candidate)}
                          >
                            <span>
                              {candidate.address}
                              <small className="block">
                                {candidate.precision === 'address'
                                  ? 'Dirección'
                                  : candidate.precision === 'intersection'
                                    ? 'Intersección'
                                    : 'Aproximada'}
                                {' · Confirmar ubicación'}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <label className="block text-xs font-semibold text-slate-600">
                  Referencia interna del pedido (opcional)
                  <input
                    className="rp-input mt-1.5 px-3 py-3 font-mono text-sm font-normal"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, orderId: event.target.value }))
                    }
                    placeholder="Ej. RP-10025 (opcional)"
                    value={draft.orderId}
                  />
                </label>
                <div className="border-t border-slate-200 pt-4">
                  <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm font-medium leading-5 text-slate-700">
                    <input
                      checked={draft.emailNotificationsEnabled}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          emailNotificationsEnabled: event.target.checked,
                          customerEmail: event.target.checked ? current.customerEmail : '',
                        }))
                      }
