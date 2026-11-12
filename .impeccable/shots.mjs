// Capturas locales con la API simulada en el navegador: no toca producción ni la base de datos.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const base = process.env.SHOTS_URL ?? 'http://127.0.0.1:3100';
const out = process.env.SHOTS_OUT ?? '.impeccable/review';
const only = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const now = Date.now();
const iso = (offsetSeconds = 0) => new Date(now - offsetSeconds * 1000).toISOString();
const couriers = [
  { id: 'c1', name: 'Carlos Muñoz', phone: '3001112233', status: 'ON_ROUTE', currentLat: 1.2142, currentLng: -77.2804, lastLocationAt: iso(8) },
  { id: 'c2', name: 'Laura Pérez', phone: '3004445566', status: 'AVAILABLE', currentLat: 1.2136, currentLng: -77.2811, lastLocationAt: iso(21) },
  { id: 'c3', name: 'Sofía Benavides', phone: '3007778899', status: 'AVAILABLE', currentLat: 1.2201, currentLng: -77.2752, lastLocationAt: iso(5) },
  { id: 'c4', name: 'Andrés Rosero', phone: '3002223344', status: 'OFFLINE', currentLat: null, currentLng: null, lastLocationAt: iso(900) },
];
const pending = [
  ['p1', 'DEMO-014', 'Carrera 25 #4 Sur-65, Pasto', 1.199, -77.284],
  ['p2', 'DEMO-015', 'Calle 19 #29-40, Centro', 1.2155, -77.2822],
  ['p3', 'DEMO-016', 'Avenida Panamericana #12-30, Pandiaco', 1.226, -77.287],
  ['p4', 'DEMO-017', 'Calle 22 #8-15, Las Cuadras', 1.2185, -77.276],
  ['p5', 'DEMO-018', 'Carrera 40 #19-02, Anganoy', 1.221, -77.295],
].map(([id, orderId, address, lat, lng]) => ({ id, orderId, address, lat, lng, status: 'PENDING', sequenceIndex: null }));
const stops = [
  { id: 's1', orderId: 'DEMO-009', address: 'Carrera 27 #17-50, Centro', lat: 1.2139, lng: -77.2799, status: 'DELIVERED', sequenceIndex: 0 },
  { id: 's2', orderId: 'DEMO-010', address: 'Calle 18 #22-14, Centro', lat: 1.215, lng: -77.2798, status: 'EN_ROUTE', sequenceIndex: 1 },
  { id: 's3', orderId: 'DEMO-011', address: 'Avenida Idema #5-30, Las Lunas', lat: 1.2172, lng: -77.2744, status: 'PENDING', sequenceIndex: 2 },
  { id: 's4', orderId: 'DEMO-012', address: 'Calle 20 #34-18, Santiago', lat: 1.2196, lng: -77.2722, status: 'PENDING', sequenceIndex: 3 },
];
const geometry = { type: 'LineString', coordinates: [[-77.2804, 1.2142], [-77.2799, 1.2139], [-77.2798, 1.215], [-77.2744, 1.2172], [-77.2722, 1.2196]] };
const route = {
  id: 'r1-7f3a9c21', courierId: 'c1', status: 'IN_PROGRESS', estimatedDurationMinutes: 27, estimatedDistanceMeters: 4200,
  canUndo: true, geometry, geometryProvider: 'OSRM', optimizedAt: iso(60), courier: couriers[0], deliveryPoints: stops,
  optimization: {
    legs: [
      { fromStop: 'courier', toStop: 's1', minutes: 6.2 },
      { fromStop: 's1', toStop: 's2', minutes: 9.8 },
      { fromStop: 's2', toStop: 's3', minutes: 7.4 },
      { fromStop: 's3', toStop: 's4', minutes: 3.6 },
    ],
