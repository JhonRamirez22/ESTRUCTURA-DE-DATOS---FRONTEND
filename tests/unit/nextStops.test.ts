import { describe, expect, it } from 'vitest';
import { activeRouteId, computeNextStops, nextStopRoles } from '@/lib/nextStops';
import { fillExplanation } from '@/components/LiveOptimizationHud';

const stop = (id: string, lat: number, lng: number, sequenceIndex: number, status?: 'PENDING' | 'DELIVERED') => ({
  id, lat, lng, sequenceIndex, status,
});
const routes = [
  { id: 'a', courier: { currentLat: 1.2, currentLng: -77.3 }, deliveryPoints: [
    stop('a0', 1.2, -77.2999, 0, 'DELIVERED'), stop('a2', 1.21, -77.29, 2), stop('a1', 1.2005, -77.298, 1),
  ] },
  { id: 'b', courier: { currentLat: 1.2, currentLng: -77.25 }, deliveryPoints: [stop('b0', 1.2, -77.2, 0)] },
  { id: 'c', courier: { currentLat: 1.2, currentLng: -77.2 }, deliveryPoints: [stop('c0', 1.2, -77.2, 0, 'DELIVERED')] },
];

describe('nextStops', () => {
  it('toma la primera parada abierta de cada ruta y marca la más cercana de la flota', () => {
    const infos = computeNextStops(routes);
    expect(infos.map((i) => i.stopId)).toEqual(['a1', 'b0']); // c no tiene paradas abiertas
    expect(infos.find((i) => i.focus)?.routeId).toBe('a'); // a1 está a ~0,06 km; b0 a 5 km
    expect(activeRouteId(infos)).toBe('a');
    expect(nextStopRoles(infos).get('a1')).toBe('focus-next');
    expect(nextStopRoles(infos).get('b0')).toBe('next');
    expect(infos.every((i) => i.etaMinutes === null)).toBe(true); // sin servidor no se inventan minutos
  });

  it('usa los minutos y el foco del servidor cuando coinciden con lo que se ve', () => {
    const infos = computeNextStops(routes, {
      focusRouteId: 'b',
      nextStops: [{ routeId: 'b', stopId: 'b0', etaMinutes: 3.5, focus: true }],
    });
    expect(infos.find((i) => i.routeId === 'b')).toMatchObject({ focus: true, etaMinutes: 3.5 });
    expect(infos.find((i) => i.routeId === 'a')?.focus).toBe(false);
  });

  it('sin repartidor con posición no inventa un foco por distancia fantasma', () => {
    expect(computeNextStops([])).toEqual([]);
  });
});

describe('fillExplanation', () => {
  it('rellena nombres y direcciones locales y deja un texto legible si faltan', () => {
    const base = {
      id: 'move:s1', kind: 'move' as const, source: 'deterministic' as const,
      text: '{stop} pasa de {from} a {to}: {to} llega antes.', routeId: null,
      stopId: 's1', fromRouteId: 'a', toRouteId: 'b',
    };
    expect(fillExplanation(base, new Map([['a', 'Ana'], ['b', 'Beto']]), { s1: 'Calle 18' }))
      .toBe('Calle 18 pasa de Ana a Beto: Beto llega antes.');
    expect(fillExplanation(base, new Map(), {})).toBe('una parada pasa de otra ruta a otra ruta: otra ruta llega antes.');
  });
});
