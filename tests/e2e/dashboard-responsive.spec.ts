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
  await mockDashboardData(page);
  for (const path of ['analitica', 'notificaciones']) {
    await page.route(`**/api/v1/${path}*`, (route) => route.fulfill({ status: 503, json: {} }));
  }
  await loginAsDispatcher(page);
  await expect(page.getByText('Avenida de Prueba 5 # 8-12, Pasto')).toBeVisible();
  await expect(page.getByRole('button', { name: /Analizar reparto|Cambió la selección/ })).toBeEnabled();
  await expect(page.getByText(/Analítica: El servicio no está disponible/)).toBeVisible();
});

test('una caída esencial conserva el mapa pero bloquea despachar hasta recuperar datos', async ({ page }) => {
  await mockDashboardData(page);
  await loginAsDispatcher(page);
  await expect(page.getByText('Avenida de Prueba 5 # 8-12, Pasto')).toBeVisible();
  await page.route('**/api/v1/rutas', (route) => route.fulfill({
    status: 503, json: {}, headers: { 'X-Request-ID': 'e2e-safe-reference' },
  }));
  await page.getByRole('button', { name: 'Actualizar datos' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Rutas:' })).toContainText('e2e-safe-reference');
  await expect(page.getByRole('button', { name: /Analizar reparto|Cambió la selección/ })).toBeDisabled();
  await expect(page.getByText('Avenida de Prueba 5 # 8-12, Pasto')).toBeVisible();
  await page.unroute('**/api/v1/rutas');
  await page.getByRole('button', { name: 'Actualizar datos' }).click();
  await expect(page.getByRole('button', { name: /Analizar reparto|Cambió la selección/ })).toBeEnabled();
});

test("el dashboard no se desborda en móviles estrechos", async ({ page }) => {
  await mockDashboardData(page);
  await loginAsDispatcher(page);

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await expect
      .poll(() =>
        page
          .getByRole("region", { name: "Mapa de rutas" })
          .locator(".maplibregl-map")
          .evaluate((map) => map.clientHeight),
      )
      .toBeGreaterThan(0);
  }
});

test("el mapa es el escenario del despacho y la hoja flota sobre él", async ({ page }, testInfo) => {
  await mockDashboardData(page);
  await loginAsDispatcher(page);

  const mapSection = page.getByRole("region", { name: "Mapa y rutas activas" });
  await expect(mapSection).toBeVisible();
  const map = page.getByRole("region", { name: "Mapa de rutas" });
  await expect(map).toBeVisible();
  await expect(map.getByRole("status", { name: "Carga del mapa" })).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByRole("region", { name: "Despachar pedidos" })).toBeVisible();
  // El resumen operativo precede al escenario, y el panel de despacho vive dentro de él.
  const layout = await page.evaluate(() => {
    const stage = document.querySelector('[aria-label="Mapa y rutas activas"]');
    const metrics = document.querySelector('[aria-label="Resumen operativo"]');
    const dispatch = document.querySelector('[aria-label="Despachar pedidos"]');
    return {
      metricsBeforeStage: Boolean(
        stage && metrics && (metrics.compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      ),
      dispatchInsideStage: Boolean(stage && dispatch && stage.contains(dispatch)),
      mapInsideStage: Boolean(stage && stage.querySelector('[aria-label="Mapa de rutas"]')),
    };
  });

  expect(layout).toEqual({ metricsBeforeStage: true, dispatchInsideStage: true, mapInsideStage: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  expect((await page.locator('.rp-shell-header').boundingBox())?.width).toBe(1440);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() =>
      mapSection
        .getByLabel("Mapa de rutas")
        .locator(".maplibregl-map")
        .evaluate((map) => map.clientHeight),
    )
    .toBeGreaterThan(400);
  await page.screenshot({ path: testInfo.outputPath("dashboard-dispatcher-desktop.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  expect((await page.locator('.rp-shell-header').boundingBox())?.width).toBe(390);
  // En móvil el despacho es una hoja con pestañas, no una página larga con anclas.
  const tabs = page.getByRole('tablist', { name: 'Secciones del despacho' });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('tab', { name: /Pedidos/ })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: /Rutas/ }).click();
  await expect(page.locator('#active-routes ol.rl-line')).toContainText('Calle de Prueba 10 # 2-03, Pasto');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("dashboard-dispatcher-mobile.png") });
  await expect(page.getByText("Centro del mapa:")).toHaveCount(0);
});

test('el recálculo en vivo se repite cada 10 s, muestra el ahorro y no cambia nada por sí solo', async ({ page }) => {
  await page.clock.install();
  await mockDashboardData(page);
  const calls: string[] = [];
  const unsafe: string[] = [];
  page.on('request', (request) => {
    if (['/recalcular', '/aplicar', '/propuesta'].some((part) => request.url().includes(part))) unsafe.push(request.url());
  });
  await page.route('**/api/v1/optimizaciones/en-vivo', (route) => {
    calls.push(new Date().toISOString());
    const score = (total: number, longest: number, crossings: number) => ({
      totalMinutes: total, longestMinutes: longest, balance: 1.4, crossings, lowerBoundGap: 0.2,
    });
    return route.fulfill({ json: {
      enabled: true, tickSeconds: 10, computedAt: new Date().toISOString(), matrixSource: 'osrm',
      approximate: false, cached: false, skippedRoutes: [], moves: [], changed: true, savedMinutes: 6.4,
      scoreBefore: score(40, 20, 3), scoreAfter: score(33.6, 15, 0),
      routes: [{
        routeId: 'e2e-route-001', changed: true, currentOrder: ['e2e-active-stop'], proposedOrder: ['e2e-active-stop'],
        movedIn: [], movedOut: [], currentMinutes: 20, proposedMinutes: 15, savedMinutes: 5, geometry: null,
      }],
    } });
  });
  await loginAsDispatcher(page);
  const hud = page.getByRole('status', { name: 'Recalculando en vivo' });
  await expect(hud).toBeVisible({ timeout: 15000 });
  await expect(hud).toContainText('Mejora posible: −6,4 min');
  await expect(hud).toContainText('Ruta más larga 20 → 15 min');
  await expect(hud).toContainText('Cruces 3 → 0');
  await expect(hud.getByText('Repartidor de prueba')).toBeVisible();
  const first = calls.length;
  expect(first).toBeGreaterThanOrEqual(1);
  await page.clock.fastForward(10_500);
  await expect.poll(() => calls.length).toBe(first + 1);
  await page.clock.fastForward(10_500);
  await expect.poll(() => calls.length).toBe(first + 2);
  // Es una propuesta: ninguna llamada aplica ni recalcula la ruta por sí sola.
  expect(unsafe).toEqual([]);
});
