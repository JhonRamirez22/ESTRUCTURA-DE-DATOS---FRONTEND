'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { usePreferences } from '@/lib/preferences';
import { RouteLine } from '@/components/RouteLine';
import Sheet, { type SheetLayout } from '@/components/Sheet';
import type { MapInset } from '@/components/MapLibreRouteMap';
import { apiFetch } from '@/lib/apiClient';
import { containsForeignCityReference, isWithinPastoServiceArea } from '@/lib/pastoArea';

const RequestMap = dynamic(() => import('@/components/MapLibreRouteMap'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-[var(--board)] text-sm text-[var(--board-soft)]">
      Cargando mapa de Pasto…
    </div>
  ),
});

interface AddressCandidate {
  address: string;
  lat: number;
  lng: number;
  precision: 'address' | 'intersection' | 'approximate';
}

interface LookupResult {
  candidates: AddressCandidate[];
  source: 'tomtom' | 'ai+tomtom' | 'local';
  normalizedAddress: string;
  warning: string | null;
}

const LOOKUP_DEBOUNCE_MS = 600;

interface CreatedRequest {
  trackingGuide: string;
  reference: string;
  nearbyStop?: { distanceMeters: number; status: string } | null;
}

/** Solicitud pública de envío: queda en revisión hasta que despacho la acepta. */
export default function RequestDeliveryPage() {
  const { t } = usePreferences();
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState<[number, number] | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRequest | null>(null);
  const [copied, setCopied] = useState(false);
  const [inset, setInset] = useState<MapInset | undefined>(undefined);
  const [stageWide, setStageWide] = useState(false);
  const handleSheetLayout = useCallback((layout: SheetLayout) => {
    setStageWide(layout.wide);
    setInset((current) =>
      current &&
      current.top === layout.inset.top &&
      current.right === layout.inset.right &&
      current.bottom === layout.inset.bottom &&
      current.left === layout.inset.left
        ? current
        : layout.inset
    );
  }, []);
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [picked, setPicked] = useState(false);
  const lookupSequence = useRef(0);

  // La IA ayuda a deducir la dirección: TomTom primero y Groq solo si no hay coincidencias.
  useEffect(() => {
    const text = address.trim();
    const sequence = ++lookupSequence.current;
    if (picked || text.length < 5) {
      setLooking(false);
      if (!picked) setLookup(null);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLooking(true);
      void (async () => {
        try {
          const response = await apiFetch('/api/solicitudes/direccion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: text }),
            signal: controller.signal,
          });
          const payload = (await response.json().catch(() => null)) as (LookupResult & { error?: string }) | null;
          if (sequence !== lookupSequence.current) return;
          if (!response.ok || !payload) {
            setLookup({
              candidates: [],
              source: 'local',
              normalizedAddress: text,
              warning: payload?.error ?? null,
            });
            return;
          }
          setLookup(payload);
        } catch {
          if (sequence === lookupSequence.current) setLookup(null);
        } finally {
          if (sequence === lookupSequence.current) setLooking(false);
        }
      })();
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, picked]);

  const pickCandidate = (candidate: AddressCandidate) => {
    ++lookupSequence.current;
    setPicked(true);
    setAddress(candidate.address);
    setPoint([candidate.lat, candidate.lng]);
    setLookup(null);
    setError(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const text = address.trim();
    if (text.length < 5) {
      setError('Escribe la dirección de entrega (al menos 5 caracteres).');
      return;
    }
    if (containsForeignCityReference(text)) {
      setError('Por ahora solo atendemos direcciones dentro de Pasto, Nariño.');
      return;
    }
    if (!point) {
      setError('Marca en el mapa el punto exacto de entrega.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const response = await apiFetch('/api/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: text, lat: point[0], lng: point[1] }),
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<CreatedRequest> & { error?: unknown };
      if (!response.ok || !payload.trackingGuide || !payload.reference) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'No se pudo enviar la solicitud.');
      }
      setCreated({ trackingGuide: payload.trackingGuide, reference: payload.reference });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo enviar la solicitud.');
    } finally {
      setSending(false);
    }
  };

  const copyGuide = async (): Promise<void> => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.trackingGuide);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <AppShell active="request">
      <main className="rl-page">
        <header className="rl-page-head">
          <div>
            <h1>{t('request.title')}</h1>
            <p>{t('request.lead')}</p>
          </div>
        </header>

        {created ? (
          <section aria-labelledby="request-done" className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="rl-board route-proposal">
              <h2 className="text-2xl font-semibold !text-[var(--board-ink)]" id="request-done">
                {t('request.done')}
              </h2>
              <p className="mt-2 text-sm">
                Referencia <span className="font-semibold tabular-nums !text-[var(--board-ink)]">{created.reference}</span>.
                Guarda tu guía: es la única forma de consultar el estado.
              </p>
              {created.nearbyStop ? (
                <p className="rl-notice is-ok mt-4 !block text-sm" role="status">
                  {t('request.nearby')}
                </p>
              ) : null}
              <p className="mt-5 text-xs font-semibold">{t('request.guide')}</p>
              <p className="mt-1 break-all text-lg font-semibold tabular-nums !text-[var(--board-ink)]">
                {created.trackingGuide}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button className="rp-button rp-button-primary" data-tip="tip.copyGuide" onClick={() => void copyGuide()} type="button">
                  {copied ? t('request.copied') : t('request.copy')}
                </button>
                <Link
                  className="rp-button rp-button-quiet"
                  href={`/cliente?guia=${encodeURIComponent(created.trackingGuide)}`}
                >
                  {t('request.follow')}
                </Link>
              </div>
            </div>
            <div>
              <div className="rl-head">
                <h2>{t('request.next')}</h2>
              </div>
              <div className="mt-4">
                <RouteLine
                  label="Estado de tu solicitud"
                  selected
                  stops={[
                    { id: 'enviada', label: 'Solicitud enviada', state: 'done' },
                    { id: 'revision', label: 'En revisión', meta: 'El despacho confirma la dirección', state: 'current' },
                    { id: 'asignada', label: 'Asignada a un repartidor', state: 'pending' },
                    { id: 'entregada', label: 'Entregada', state: 'pending' },
                  ]}
                />
              </div>
            </div>
          </section>
        ) : (
          <section aria-label={t('request.mapTitle')} className={`rp-stage ${stageWide ? 'is-wide' : ''}`}>
                <RequestMap
                  ariaLabel="Mapa para marcar el punto de entrega"
                  className="absolute inset-0 h-full w-full"
                  inset={inset}
                  couriers={[]}
                  onMapClick={({ lat, lng }) => {
                    if (!isWithinPastoServiceArea(lat, lng)) {
                      setError('Ese punto queda fuera de la zona de servicio de Pasto.');
                      return;
                    }
                    setError(null);
                    setPoint([lat, lng]);
