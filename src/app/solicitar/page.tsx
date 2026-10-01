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
