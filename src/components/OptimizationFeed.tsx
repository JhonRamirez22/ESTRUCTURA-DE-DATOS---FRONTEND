'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/preferences';
import { apiFetch } from '@/lib/apiClient';

const REFRESH_MS = 5_000;

interface FeedEvent {
  at: string;
  kind: 'propuesta' | 'aplicada';
  routeAlias: string;
  changed: boolean;
  improvementMinutes: number | null;
  trafficSegments: number;
  aiApplied: boolean;
  aiOrderAccepted?: boolean;
  aiOrderSavingMinutes?: number;
}

interface Incident {
  at: string;
  provider: string;
  kind: string;
}

interface FeedPayload {
  events: FeedEvent[];
  incidents?: Incident[];
  stats: {
    proposals: number;
    cacheHits: number;
    applied: number;
    trafficSegments: number;
    savedMinutes: number;
  };
  summaryCooldownSeconds: number;
}

/** Panel en vivo: muestra lo que el sistema propone y aplica, sin cambiar ninguna ruta. */
export default function OptimizationFeed() {
  const t = useT();
  const [feed, setFeed] = useState<FeedPayload | null>(null);
