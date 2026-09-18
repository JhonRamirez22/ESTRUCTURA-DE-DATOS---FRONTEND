'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import { useT } from '@/lib/preferences';

interface Proposal {
  changed: boolean;
  worthApplying?: boolean;
  improvementMinutes: number | null;
  baselineDurationMinutes?: number | null;
  estimatedDurationMinutes: number;
}

type State =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'better'; proposal: Proposal }
  | { kind: 'same' }
  | { kind: 'error'; message: string };

/** El despachador pide revisar una ruta con el tráfico de ahora; solo se aplica si él acepta. */
export default function RouteImprovementCheck({
  routeId,
  canCheck,
  onApply,
}: {
  routeId: string;
  canCheck: boolean;
