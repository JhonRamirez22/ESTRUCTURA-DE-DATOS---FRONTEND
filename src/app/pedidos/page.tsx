'use client';

import { apiFetch } from '@/lib/apiClient';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppShell from '@/components/AppShell';
import { usePreferences } from '@/lib/preferences';
import { scheduleBounds, scheduleToPayload } from '@/lib/history';
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
  priority: '1' | '2' | '3';
  windowStart: string;
  windowEnd: string;
  scheduledFor: string;
}

interface AddressNormalizationStatus {
  source: 'external-ai' | 'deterministic';
  confidence?: number;
  warning?: string;
}

interface PendingOrderPoint extends MapDeliveryPoint {
  orderId: string;
  priority?: number;
  timeWindow?: { start?: string; end?: string } | null;
}

interface AddressCandidate {
  address: string;
  lat: number;
  lng: number;
  precision: 'address' | 'intersection' | 'approximate';
}

export default function OrdersPage() {
  const { t } = usePreferences();
  const [draft, setDraft] = useState<OrderDraft>({
    address: '',
    orderId: '',
    lat: '',
    lng: '',
    priority: '1',
    windowStart: '',
    windowEnd: '',
    scheduledFor: '',
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
  const windowInvalid = draft.windowStart !== '' && draft.windowEnd !== '' && draft.windowEnd <= draft.windowStart;
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
          priority?: number;
          timeWindow?: { start?: string; end?: string } | null;
        }>;
      };

      setPendingPoints(
        payload.deliveryPoints.map((point) => ({
          ...point,
