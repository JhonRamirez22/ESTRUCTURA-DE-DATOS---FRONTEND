import { expect, test, type Page } from "@playwright/test";
import { loginAsDispatcher } from "./auth";
import { mockMapStyle } from './mapStyle';

async function mockDashboardData(page: Page): Promise<void> {
  await mockMapStyle(page);
  const now = new Date().toISOString();
  const activeCourier = {
    id: "e2e-courier-active",
    name: "Repartidor de prueba",
    phone: "+573000000001",
    status: "ON_ROUTE",
    currentLat: 1.2142,
    currentLng: -77.2804,
    lastLocationAt: now,
  };
  const availableCourier = {
    id: "e2e-courier-available",
    name: "Repartidor disponible",
    phone: "+573000000002",
    status: "AVAILABLE",
    currentLat: 1.2136,
    currentLng: -77.2811,
    lastLocationAt: now,
  };
  const activeStop = {
    id: "e2e-active-stop",
    orderId: "E2E-ACTIVE-001",
    address: "Calle de Prueba 10 # 2-03, Pasto",
    lat: 1.215,
    lng: -77.2798,
    status: "EN_ROUTE",
    sequenceIndex: 0,
  };

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;

    if (url.pathname === "/api/v1/repartidores" && route.request().method() === "GET") {
      body = { couriers: [activeCourier, availableCourier] };
    } else if (url.pathname === "/api/v1/notificaciones/clientes/estado") {
      body = {
        channels: {
          email: { configured: false, pending: 0, retrying: 0, processing: 0, failed: 0 },
          sms: { configured: false, pending: 0, retrying: 0, processing: 0, failed: 0 },
        },
        workerRunning: false,
        warning: "Canales de prueba sin configurar.",
      };
    } else if (url.pathname === "/api/v1/notificaciones") {
      body = { notifications: [] };
    } else if (url.pathname === "/api/v1/pedidos") {
      body = {
        deliveryPoints: [
          {
            id: "e2e-pending-stop",
            orderId: "E2E-PENDING-001",
            address: "Avenida de Prueba 5 # 8-12, Pasto",
            lat: 1.2161,
            lng: -77.2789,
            status: "PENDING",
            sequenceIndex: null,
          },
        ],
      };
    } else if (url.pathname === "/api/v1/rutas") {
      body = {
        routes: [
          {
            id: "e2e-route-001",
            courierId: activeCourier.id,
            status: "IN_PROGRESS",
            estimatedDurationMinutes: 18,
            estimatedDistanceMeters: 2_350,
            canUndo: false,
            geometry: {
              type: "LineString",
              coordinates: [
                [-77.2804, 1.2142],
                [-77.2801, 1.2146],
                [-77.2798, 1.215],
              ],
            },
            geometryProvider: "OSRM",
            courier: activeCourier,
            deliveryPoints: [activeStop],
          },
        ],
      };
    } else if (url.pathname === "/api/v1/analitica") {
      body = {
        metrics: {
          routeCount: 1,
          completedRouteCount: 0,
          estimatedDurationMinutes: 18,
          estimatedDistanceMeters: 2_350,
          timeSavedMinutes: 4,
          distanceSavedMeters: 320,
          routesWithBaseline: 1,
        },
      };
    } else {
      await route.continue();
      return;
    }

    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });
}

test('solo el recorrido seleccionado consulta tráfico, sin teselas extra ni recálculos', async ({ page }, testInfo) => {
  await page.clock.install();
  await mockDashboardData(page);
  let consultations = 0;
  let observedAt = Date.now();
  const unwanted: string[] = [];
  page.on('request', (request) => {
    if (['/trafico/tiles/', '/trafico/estado', '/recalcular'].some((path) => request.url().includes(path))) unwanted.push(request.url());
  });
  await page.route('**/api/v1/rutas/e2e-route-001/trafico-vivo', (route) => {
    consultations += 1;
    return route.fulfill({ json: {
      configured: true, available: true,
      observations: [{ observedAt: new Date(observedAt).toISOString(), cacheStatus: 'LIVE', roadClosure: false }],
    } });
  });
  await loginAsDispatcher(page);
  await expect(page.getByText(/Tráfico de esta ruta/)).toBeVisible({ timeout: 15000 });
  const initialConsultations = consultations;
  expect(initialConsultations).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('checkbox', { name: 'Tráfico TomTom' })).toHaveCount(0);
  observedAt += 90_001;
  await page.clock.fastForward(90_001);
  await expect.poll(() => consultations).toBe(initialConsultations + 1);
  await expect(page.getByText(/Tráfico de esta ruta/)).toBeVisible();
  expect(unwanted).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('solo-ruta-verde.png') });
});

test('la caída de analítica y avisos no impide analizar pedidos', async ({ page }) => {
