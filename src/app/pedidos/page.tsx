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
