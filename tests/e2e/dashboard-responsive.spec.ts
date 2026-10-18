import { expect, test, type Page } from "@playwright/test";
import { loginAsDispatcher } from "./auth";

async function mockDashboardData(page: Page): Promise<void> {
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

test("el mapa domina el dashboard antes de métricas y despacho", async ({ page }, testInfo) => {
  await mockDashboardData(page);
  await loginAsDispatcher(page);

  const mapSection = page.getByRole("region", { name: "Mapa y rutas activas" });
  await expect(mapSection).toBeVisible();
  const map = page.getByRole("region", { name: "Mapa de rutas" });
  await expect(map).toBeVisible();
  await expect(map.getByRole("status")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Despachar pedidos" })).toBeVisible();
  const mapPrecedesSummary = await page.evaluate(() => {
    const map = document.querySelector('[aria-label="Mapa y rutas activas"]');
    const metrics = document.querySelector('[aria-label="Resumen operativo"]');
    return Boolean(
      map &&
        metrics &&
        (map.compareDocumentPosition(metrics) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
  });
  const mapPrecedesDispatch = await page.evaluate(() => {
    const map = document.querySelector('[aria-label="Mapa y rutas activas"]');
    const dispatch = document.querySelector('[aria-label="Despachar pedidos"]');
    return Boolean(
      map &&
        dispatch &&
        (map.compareDocumentPosition(dispatch) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
  });

  expect(mapPrecedesSummary).toBe(true);
  expect(mapPrecedesDispatch).toBe(true);
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
  const shortcuts = page.getByRole('navigation', { name: 'Accesos rápidos del despacho' });
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts.getByRole('link', { name: 'Ver rutas activas' })).toHaveAttribute('href', '#active-routes');
  await expect(shortcuts.getByRole('link', { name: 'Asignar pedidos' })).toHaveAttribute('href', '#dispatch-orders');
  const shortcutBounds = await shortcuts.boundingBox();
  expect(shortcutBounds!.y + shortcutBounds!.height).toBeLessThan(844);
  await expect(page.locator('#active-routes ol')).toContainText('Calle de Prueba 10 # 2-03, Pasto');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath("dashboard-dispatcher-mobile.png") });
  await expect(page.getByText("Centro del mapa:")).toHaveCount(0);
});
