'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import AppShell from '@/components/AppShell';
import { usePreferences } from '@/lib/preferences';
import { RouteLine } from '@/components/RouteLine';
import { apiFetch } from '@/lib/apiClient';
import { containsForeignCityReference, isWithinPastoServiceArea } from '@/lib/pastoArea';

const RequestMap = dynamic(() => import('@/components/MapLibreRouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[420px] items-center justify-center bg-[var(--board)] text-sm text-[var(--board-soft)]">
      Cargando mapa de Pasto…
    </div>
  ),
});

interface CreatedRequest {
  trackingGuide: string;
  reference: string;
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
          <section className="grid items-start gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
            <form className="rl-section space-y-5" noValidate onSubmit={(event) => void submit(event)}>
              <div className="rl-head">
                <h2>{t('request.form')}</h2>
              </div>
              <label className="rp-field-label">
                {t('request.address')}
                <input
                  aria-describedby="request-address-help"
                  autoComplete="street-address"
                  className="rp-input mt-1.5 px-3 text-[15px] font-normal"
                  maxLength={200}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Ej. Calle 18 # 22-14, Centro"
                  value={address}
                />
                <span className="rp-field-help" id="request-address-help">
                  {t('request.address.help')}
                </span>
              </label>
              <div className="text-sm">
                <span className="font-semibold">{t('request.point')}</span>
                <p className={`mt-1 tabular-nums ${point ? 'text-[var(--route-ink)]' : 'text-[var(--ink-soft)]'}`}>
                  {point ? `${point[0].toFixed(6)}, ${point[1].toFixed(6)}` : t('request.point.empty')}
                </p>
              </div>
              {error ? (
                <p className="rl-notice is-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="rp-button rp-button-go rp-button-block" data-tip="tip.sendRequest" disabled={sending} type="submit">
                {sending ? t('request.sending') : t('request.send')}
              </button>
              <p className="text-xs leading-5 text-[var(--ink-soft)]">
                {t('request.haveGuide')}{' '}
                <Link className="font-semibold underline underline-offset-4" href="/cliente">
                  {t('request.track')}
                </Link>
              </p>
            </form>
            <div className="rp-map-frame order-first lg:order-none">
              <div className="rp-map-heading">
                <h2>{t('request.mapTitle')}</h2>
                <span className="rl-state text-[var(--board-soft)]">{t('request.onlyPasto')}</span>
              </div>
              <div className="h-[360px] lg:h-[480px]">
                <RequestMap
                  ariaLabel="Mapa para marcar el punto de entrega"
                  className="h-full w-full"
                  couriers={[]}
                  onMapClick={({ lat, lng }) => {
                    if (!isWithinPastoServiceArea(lat, lng)) {
                      setError('Ese punto queda fuera de la zona de servicio de Pasto.');
                      return;
                    }
                    setError(null);
                    setPoint([lat, lng]);
                  }}
                  pendingPoints={[]}
                  routes={[]}
                  selectedCoordinate={point}
                />
              </div>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
