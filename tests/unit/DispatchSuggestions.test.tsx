import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import DispatchSuggestions from '@/components/DispatchSuggestions';

const payload = {
  enabled: true,
  suggestions: [
    { id: 'idle_courier:c1', kind: 'idle_courier', severity: 'action', text: 'Ana está libre y tiene 2 pedidos cerca.', source: 'deterministic', action: { type: 'select', label: 'x', deliveryPointIds: ['p1', 'p2'] } },
    { id: 'stale_gps:c2', kind: 'stale_gps', severity: 'warning', text: 'Beto no envía ubicación hace 14 min.', source: 'groq-validated', action: null },
  ],
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
