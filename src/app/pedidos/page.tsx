'use client';

import { apiFetch } from '@/lib/apiClient';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { formatOrderReference } from '@/lib/formatOrderReference';
import { isWithinPastoServiceArea, normalizePastoAddress } from '@/lib/pastoArea';
import type { MapDeliveryPoint } from '@/components/MapLibreRouteMap';
import { addressCacheKey, getResolvedAddress, rememberResolvedAddress } from '@/lib/addressCache';

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
  const [requests, setRequests] = useState<PendingOrderPoint[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
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
      const cacheKey = addressCacheKey(draft.address);
      const cached = getResolvedAddress<AddressCandidate>(cacheKey);
      if (cached !== undefined) {
        setCandidates(cached.candidates);
        setAddressNotice(cached.warning ?? 'Confirma la ubicación sugerida antes de guardar.');
        if (cached.candidates.length === 1) {
          setSelectedCoordinate([cached.candidates[0]!.lat, cached.candidates[0]!.lng]);
        }
        return;
      }
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
          rememberResolvedAddress(cacheKey, { candidates: suggestions, warning: payload.warning });
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

  /** Solicitudes de clientes: no entran al despacho hasta que se aceptan aquí. */
  const loadRequests = useCallback(async (): Promise<void> => {
    try {
      const response = await apiFetch('/api/pedidos?status=REQUESTED', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudieron cargar las solicitudes de clientes.');
      const payload = (await response.json()) as {
        deliveryPoints: Array<{ id: string; orderId: string; address: string; lat: number; lng: number }>;
      };
      setRequests(
        payload.deliveryPoints.map((point) => ({ ...point, status: 'PENDING' as const, sequenceIndex: null }))
      );
      setRequestError(null);
    } catch (loadError) {
      setRequestError(
        loadError instanceof Error ? loadError.message : 'No se pudieron cargar las solicitudes de clientes.'
      );
    }
  }, []);

  const resolveRequest = async (request: PendingOrderPoint, action: 'aceptar' | 'rechazar'): Promise<void> => {
    setResolvingId(request.id);
    setRequestError(null);
    setSuccess(null);
    try {
      const response = await apiFetch(`/api/solicitudes/${encodeURIComponent(request.id)}/${action}`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, 'No se pudo resolver la solicitud.'));
      }
      setSuccess(
        action === 'aceptar'
          ? `Solicitud ${formatOrderReference(request.orderId)} aceptada: ya está en pendientes para despachar.`
          : `Solicitud ${formatOrderReference(request.orderId)} rechazada.`
      );
      await Promise.all([loadRequests(), loadPendingOrders()]);
    } catch (resolveError) {
      setRequestError(resolveError instanceof Error ? resolveError.message : 'No se pudo resolver la solicitud.');
      await loadRequests();
    } finally {
      setResolvingId(null);
    }
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
    void loadRequests();
  }, [loadPendingOrders, loadRequests]);

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
        `Pedido ${formatOrderReference(payload.deliveryPoint.orderId)} listo. Guía privada para el cliente: ${payload.trackingGuide}.`
      );
      setDraft({
        address: '',
        orderId: '',
        lat: '',
        lng: '',
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
      <main className="rp-orders rl-page">
        <header className="rl-page-head">
          <div>
            <h1>Registrar un pedido</h1>
            <p>Escribe la dirección, confirma la ubicación en Pasto y queda lista para el despacho.</p>
          </div>
          <dl className="rl-figures">
            <div>
              <dt>pendientes</dt>
              <dd>{pendingPoints.length}</dd>
            </div>
          </dl>
        </header>

        <div className="mb-6 empty:hidden">
          {error ? <Alert tone="error">{error}</Alert> : null}
          {success ? <Alert tone="success">{success}</Alert> : null}
          {normalization ? (
            <p className="rl-notice text-sm">
              {normalization.source === 'external-ai'
                ? `La IA normalizó la dirección con ${Math.round((normalization.confidence ?? 0) * 100)}% de confianza.`
                : (normalization.warning ?? 'La dirección fue normalizada localmente.')}
            </p>
          ) : null}
        </div>

        <section className="grid items-start gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
          <div className="min-w-0 lg:order-2">
            <div className="rp-map-frame">
              <div className="rp-map-heading">
                <h2>Pasto · selecciona una ubicación</h2>
                <span className="rl-state text-[var(--board-soft)]">Solo Pasto</span>
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
          </div>

          <div className="min-w-0 space-y-10 lg:order-1">
            {requests.length > 0 || requestError ? (
              <section aria-label="Solicitudes de clientes" className="rl-section">
                <div className="rl-head">
                  <h2>
                    Solicitudes de clientes <small>{requests.length} en revisión</small>
                  </h2>
                </div>
                {requestError ? (
                  <p className="rl-notice is-warn mt-3" role="alert">
                    {requestError}
                  </p>
                ) : null}
                <ul className="rl-rows">
                  {requests.map((request) => (
                    <li className="rl-row flex-wrap !items-start !py-3" key={request.id}>
                      <button
                        className="rl-row-main min-w-0 text-left"
                        onClick={() => setSelectedCoordinate([request.lat, request.lng])}
                        title="Ver en el mapa"
                        type="button"
                      >
                        <strong className="truncate">{request.address}</strong>
                        <span className="rl-ref">{formatOrderReference(request.orderId)} · ver en el mapa</span>
                      </button>
                      <span className="flex gap-2">
                        <button
                          aria-label={`Rechazar solicitud ${formatOrderReference(request.orderId)}`}
                          className="rp-button rp-button-danger rp-button-small"
                          disabled={resolvingId !== null}
                          onClick={() => void resolveRequest(request, 'rechazar')}
                          type="button"
                        >
                          Rechazar
                        </button>
                        <button
                          aria-label={`Aceptar solicitud ${formatOrderReference(request.orderId)}`}
                          className="rp-button rp-button-go rp-button-small"
                          disabled={resolvingId !== null}
                          onClick={() => void resolveRequest(request, 'aceptar')}
                          type="button"
                        >
                          {resolvingId === request.id ? 'Guardando…' : 'Aceptar'}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="rl-section">
              <div className="rl-head">
                <h2>Datos del pedido</h2>
              </div>
              <div className="mt-5 space-y-5">
                <label className="rp-field-label">
                  Dirección
                  <input
                    className="rp-input mt-1.5 px-3 text-[15px] font-normal"
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
                    <p className="text-sm text-[var(--ink-soft)]">Buscando solo en Pasto…</p>
                  ) : addressNotice ? (
                    <p className="text-sm text-[var(--ink-soft)]">{addressNotice}</p>
                  ) : null}
                  {candidates.length > 0 ? (
                    <ul aria-label="Ubicaciones sugeridas" className="rl-rows mt-2">
                      {candidates.map((candidate, index) => (
                        <li key={`${candidate.lat}:${candidate.lng}:${index}`}>
                          <button
                            type="button"
                            className="rl-row w-full text-left hover:bg-[var(--band)]"
                            onClick={() => confirmAddress(candidate)}
                          >
                            <span className="rl-row-main">
                              <strong>{candidate.address}</strong>
                              <span>
                                {candidate.precision === 'address'
                                  ? 'Dirección'
                                  : candidate.precision === 'intersection'
                                    ? 'Intersección'
                                    : 'Aproximada'}
                                {' · Confirmar ubicación'}
                              </span>
                            </span>
                            <span aria-hidden="true" className="text-lg">→</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <label className="rp-field-label">
                  Referencia interna del pedido (opcional)
                  <input
                    className="rp-input mt-1.5 px-3 text-[15px] font-normal tabular-nums"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, orderId: event.target.value }))
                    }
                    placeholder="Ej. RP-10025 (opcional)"
                    value={draft.orderId}
                  />
                </label>
                <div className="text-sm">
                  <span className="font-semibold">Coordenadas seleccionadas</span>
                  <p className={`mt-1 tabular-nums ${draft.lat && draft.lng ? 'text-[var(--route-ink)]' : 'text-[var(--ink-soft)]'}`}>
                    {draft.lat && draft.lng ? `${draft.lat}, ${draft.lng}` : selectedCoordinate
                      ? 'Sugerida · pendiente de confirmación' : 'Confirma una sugerencia o usa el mapa'}
                  </p>
                </div>
                <button
                  className="rp-button rp-button-primary rp-button-block"
                  disabled={saving}
                  onClick={() => void createOrder()}
                  type="button"
                >
                  {saving ? 'Registrando…' : 'Registrar pedido pendiente'}
                </button>
              </div>
            </section>

            <section className="rl-section">
              <div className="rl-head">
                <h2>
                  Últimos pendientes <small>Aparecerán en el centro de despacho.</small>
                </h2>
                {loading ? <span className="text-xs text-[var(--ink-soft)]">Cargando…</span> : null}
              </div>
              <ul className="rl-rows">
                {pendingPoints.slice(0, 6).map((point) => (
                  <li className="rl-row" key={point.id}>
                    <span className="rl-row-main">
                      <strong className="truncate">{point.address}</strong>
                      <span className="rl-ref">{formatOrderReference(point.orderId)}</span>
                    </span>
                    <span className="rl-state is-warn">Pendiente</span>
                  </li>
                ))}
                {pendingPoints.length === 0 ? (
                  <li className="rl-empty">No hay pendientes. Registra el primero para enviarlo al despacho.</li>
                ) : null}
              </ul>
            </section>
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Alert({ children, tone }: { children: string; tone: 'error' | 'success' }) {
  return (
    <div className={`rl-notice ${tone === 'error' ? 'is-error' : 'is-ok'}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown };
    return typeof payload.error === 'string' ? payload.error : fallback;
  } catch {
    return fallback;
  }
}
