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
};

function body(path, method, search) {
  if (path === '/api/v1/auth/access') return { allowed: true, redirectTo: null };
  if (path === '/api/v1/auth/session') return { authenticated: true };
  if (path === '/api/v1/repartidores/me') return { courier: { status: 'ON_ROUTE', currentLat: 1.2142, currentLng: -77.2804, lastLocationAt: iso(3) } };
  if (path === '/api/v1/repartidores') return { couriers };
  if (path === '/api/v1/pedidos') return { deliveryPoints: pending };
  if (path === '/api/v1/rutas') return { routes: [route] };
  if (path.endsWith('/navegacion')) return { navigation: { geometry, distanceMeters: 1400, durationMinutes: 6, source: 'osrm', geometryProvider: 'OSRM', nextDeliveryPointId: 's2', remainingDeliveryPointIds: ['s2', 's3', 's4'] } };
  if (path.endsWith('/propuesta')) return { aiOrder: { proposed: true, accepted: true, savingMinutes: 2.4, verifiedWith: 'dijkstra' }, orderedDeliveryPointIds: ['s2', 's3', 's4'], changed: false, estimatedDurationMinutes: 24, improvementMinutes: 2.4, computedAt: iso(4), cached: false };
  if (path.endsWith('/trafico-vivo')) return { observations: [] };
  if (path.endsWith('/eta')) return { etas: [{ stopId: 's2', estimatedMinutesFromNow: 6 }, { stopId: 's3', estimatedMinutesFromNow: 14 }, { stopId: 's4', estimatedMinutesFromNow: 22 }] };
  if (path === '/api/v1/notificaciones') return { notifications: [{ id: 'n1', kind: 'ROUTE_ASSIGNED', title: 'Ruta asignada', message: 'Carlos Muñoz recibió 4 paradas.', createdAt: iso(600) }] };
  if (path === '/api/v1/analitica') return { metrics: { routeCount: 3, completedRouteCount: 1, estimatedDurationMinutes: 61, estimatedDistanceMeters: 9100, timeSavedMinutes: 6.8, distanceSavedMeters: 900, routesWithBaseline: 3 } };
  if (path === '/api/v1/optimizaciones/recientes') return { events: [{ at: iso(5), kind: 'propuesta', routeAlias: 'Ruta de Carlos', changed: false, improvementMinutes: 2.4, trafficSegments: 3, aiApplied: true, aiOrderAccepted: true, aiOrderSavingMinutes: 2.4 }, { at: iso(65), kind: 'aplicada', routeAlias: 'Ruta de Laura', changed: true, improvementMinutes: 3.1, trafficSegments: 5, aiApplied: true }], incidents: [], stats: { proposals: 42, cacheHits: 30, applied: 3, trafficSegments: 18, savedMinutes: 6.8 }, summaryCooldownSeconds: 0 };
  if (path === '/api/v1/seguimiento') return { tracking: { guide: search.get('guia'), status: 'EN_ROUTE', address: 'Avenida Idema #5-30, Las Lunas', coordinates: { lat: 1.2172, lng: -77.2744 }, route: { id: 'r1', status: 'IN_PROGRESS', courier: { currentLat: 1.215, currentLng: -77.2798, lastLocationAt: iso(6) }, geometry, geometryProvider: 'OSRM', estimatedMinutesFromNow: 14, distanceFromCourierMeters: 2300, estimateNote: 'Estimado por calles con tráfico del primer tramo.' } } };
  if (path === '/api/v1/asignaciones') return { assignments: [{ courierId: 'c2', deliveryPointIds: ['p2', 'p4', 'p1'] }], unassignedDeliveryPointIds: ['p3'], ai: { source: 'deterministic', applied: false } };
  if (path === '/api/v1/cliente/chat/estado') return { available: true };
  return method === 'GET' ? {} : { ok: true };
}

const pages = [
  ['acceso', '/acceso', 'desktop'],
  ['dashboard', '/dashboard', 'desktop'],
  ['dashboard-mobile', '/dashboard', 'mobile'],
  ['propuesta', '/dashboard', 'desktop'],
  ['pedidos', '/pedidos', 'desktop'],
  ['personal', '/personal', 'desktop'],
  ['repartidor', '/repartidor', 'mobile'],
  ['cliente', '/cliente?guia=RP-7F3A-9C21', 'mobile'],
  ['inicio', '/', 'desktop'],
].filter(([name]) => only.length === 0 || only.includes(name));

const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, path, kind] of pages) {
  const context = await browser.newContext({
    viewport: kind === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    permissions: ['geolocation'],
    geolocation: { latitude: 1.2142, longitude: -77.2804 },
  });
  const page = await context.newPage();
  page.on('crash', () => console.log('CRASH', name));
  page.on('pageerror', (e) => console.log('PAGEERROR', name, e.message.slice(0, 160)));
  await page.route('**/api/v1/**', (r) => {
    const url = new URL(r.request().url());
    const headers = { 'X-CSRF-Token': 'proof', 'X-Session-Role': path.startsWith('/repartidor') ? 'courier' : 'dispatcher' };
    return r.fulfill({ contentType: 'application/json', headers, body: JSON.stringify(body(url.pathname, r.request().method(), url.searchParams)) });
  });
  await page.goto(base + path, { waitUntil: 'networkidle' }).catch(() => {});
  if (name === 'cliente') {
    const input = page.locator('#tracking-guide');
    if (await input.count()) { await input.fill('RP-7F3A-9C21'); await page.keyboard.press('Enter'); }
  }
  if (name === 'propuesta') {
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Analizar asignación' }).click();
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: name !== 'propuesta' });
  console.log('shot', name);
  await context.close();
}
await browser.close();
