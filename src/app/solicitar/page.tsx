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
