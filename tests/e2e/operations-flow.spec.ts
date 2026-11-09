import { apiRequest } from "./auth";
import { mockMapStyle } from './mapStyle';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { loginAsDispatcher, reportCourierPosition } from './auth';
import { cleanupTestData } from './cleanup';

test('no expone datos operativos a una sesión pública', async ({ request }) => {
  const healthResponse = await request.get('/api/v1/health');
  expect(healthResponse.status()).toBe(200);
  await expect(healthResponse.json()).resolves.toMatchObject({
    status: 'ok',
    checks: { database: 'ok' },
  });

  for (const endpoint of ['/api/v1/pedidos', '/api/v1/repartidores', '/api/v1/rutas']) {
    const response = await request.get(endpoint);
    expect(response.status(), endpoint).toBe(401);
    expect(response.headers()['cache-control'], endpoint).toContain('no-store');
  }
});

test('registra un pedido y lo despacha desde el flujo operativo', async ({ page }, testInfo) => {
  // Incluye una espera de 10,5 s para comprobar que el sondeo no vuelve a marcar pedidos.
  test.setTimeout(120_000);
  await mockMapStyle(page);
  await loginAsDispatcher(page);
  const request = page.context().request;
  const suffix = randomUUID();
  const guide = `UI-${suffix}`;
  const courierResponse = await apiRequest(request, "POST", '/api/v1/repartidores', {
    data: {
      name: `UI courier ${suffix}`,
      phone: `+57301${Date.now().toString().slice(-7)}`,
    },
  });

  expect(courierResponse.status()).toBe(201);
  const courierPayload = (await courierResponse.json()) as {
    courier: { id: string };
    accessCode: string;
  };
  const courierId = courierPayload.courier.id;

  try {
    await reportCourierPosition(page, courierPayload.accessCode);
    await loginAsDispatcher(page);

    await page.goto('/pedidos');
    await expect(page.getByRole('heading', { name: 'Registrar un pedido' })).toBeVisible();
    const orderMap = page.getByLabel('Mapa para seleccionar la dirección del pedido');
    await expect(orderMap.locator('.maplibregl-canvas')).toBeVisible();
    await page.getByRole('textbox', { name: 'Dirección' }).fill('Cra. 27 #18-09');
    await expect(orderMap.getByRole('status')).toHaveCount(0, { timeout: 20_000 });
    await orderMap.locator('.maplibregl-canvas').click({ position: { x: 280, y: 260 } });
    await page.getByLabel('Referencia interna del pedido (opcional)').fill(guide);
    await page.getByRole('button', { name: 'Registrar pedido pendiente' }).click();
    await expect(
      page.getByText(new RegExp(`Pedido ${guide} listo\\. Guía privada para el cliente:`))
    ).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Despacho', exact: true })).toBeVisible();
    await expect(page.getByText(guide).first()).toBeVisible();

    const dispatchSection = page.getByRole('region', { name: 'Despachar pedidos' });
    const pendingSection = dispatchSection
      .getByRole('heading', { name: '1. Pedidos pendientes' })
      .locator('xpath=../..');
    await pendingSection.getByRole('button', { name: 'Quitar todos' }).click();
    await page.waitForTimeout(10_500);
    await expect(pendingSection.locator('input[type="checkbox"]:checked')).toHaveCount(0);
    await pendingSection
      .locator('label')
      .filter({ hasText: guide })
      .locator('input[type="checkbox"]')
      .check();

    const courierSection = dispatchSection
      .getByRole('heading', { name: '2. Repartidores disponibles' })
      .locator('xpath=../..');
    const selectedCouriers = courierSection.locator('label input[type="checkbox"]:checked');
    while ((await selectedCouriers.count()) > 0) {
      await selectedCouriers.first().uncheck();
    }
    await courierSection
      .locator('label')
      .filter({ hasText: `UI courier ${suffix}` })
      .locator('input[type="checkbox"]')
      .check();

    await page.getByRole('button', { name: 'Analizar asignación' }).click();
    await expect(
      page.getByRole('heading', { name: '3. Propuesta lista para despachar' })
    ).toBeVisible();
    await expect(dispatchSection.getByText('1 paradas', { exact: true })).toBeVisible();
    const dispatchButton = page.getByRole('button', { name: 'Despachar rutas optimizadas' });
    await pendingSection
      .locator('label')
      .filter({ hasText: guide })
      .locator('input[type="checkbox"]')
      .uncheck();
    await expect(dispatchButton).toBeDisabled();
    await pendingSection
      .locator('label')
      .filter({ hasText: guide })
      .locator('input[type="checkbox"]')
      .check();
    await expect(dispatchButton).toBeEnabled();

    const routeResponsePromise = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/asignaciones/aplicar' &&
        response.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Despachar rutas optimizadas' }).click();
    const routeResponse = await routeResponsePromise;
    expect(routeResponse.status()).toBe(201);
    const routePayload = (await routeResponse.json()) as {
      routes: Array<{
        orderedDeliveryPointIds: string[];
        route: {
          id: string;
          courierId: string;
          deliveryPoints: Array<{ address: string }>;
        };
      }>;
      customerNotifications: {
        queued: number;
        channels: {
          email: { queued: number; configured: boolean };
          sms: { queued: number; configured: boolean };
        };
        warning: string | null;
      };
    };
    expect(routePayload.routes).toHaveLength(1);
    expect(routePayload.routes[0]?.route.courierId).toBe(courierId);
    expect(routePayload.routes[0]?.orderedDeliveryPointIds).toHaveLength(1);
    expect(routePayload.routes[0]?.route.deliveryPoints).toHaveLength(1);
    // Los pedidos ya no capturan correo ni teléfono: no hay avisos que encolar.
    expect(routePayload.customerNotifications?.queued ?? 0).toBe(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1280, height: 900 });
    // Tras despachar, la hoja muestra las rutas activas.
    await expect(page.getByRole('tab', { name: /Rutas/ })).toHaveAttribute('aria-selected', 'true');

    const routeCard = page.locator('article').filter({ hasText: `UI courier ${suffix}` });
    const normalizedAddress = routePayload.routes[0]?.route.deliveryPoints[0]?.address;
    expect(normalizedAddress).toBeTruthy();
    await expect(routeCard).toContainText(normalizedAddress!);
    await expect(routeCard.getByText('Sin paradas')).toHaveCount(0);

    const routeId = routePayload.routes[0]?.route.id;
    expect(routeId).toBeTruthy();
    const recalculation = await apiRequest(request, "POST", `/api/v1/rutas/${routeId}/recalcular`, { data: {} });
    expect(recalculation.status()).toBe(200);
    await page.reload();
    await page.getByRole('tab', { name: /Rutas/ }).click();
    await expect(
      routeCard.getByRole('button', {
        name: `Deshacer último recálculo de la ruta de UI courier ${suffix}`,
      })
    ).toBeVisible();
    await routeCard
      .getByRole('button', {
        name: `Deshacer último recálculo de la ruta de UI courier ${suffix}`,
      })
      .click();
    await expect(page.getByText('Se restauró el recálculo anterior de la ruta.', { exact: true }))
      .toBeVisible();
    await expect(
      routeCard.getByRole('button', {
        name: `Deshacer último recálculo de la ruta de UI courier ${suffix}`,
      })
    ).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 900 });
    await routeCard.scrollIntoViewIfNeeded();
    await routeCard.screenshot({ path: testInfo.outputPath('route-undo-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await routeCard.screenshot({ path: testInfo.outputPath('route-undo-mobile.png') });
  } finally {
    await cleanupTestData({ courierId, orderIds: [guide] });
  }
});

test('permite borrar desde despacho solo después de confirmar', async ({ page }) => {
  await mockMapStyle(page);
  await loginAsDispatcher(page);
  const request = page.context().request;
  const orderId = `DELETE-${randomUUID()}`;
  const created = await apiRequest(request, 'POST', '/api/v1/pedidos', {
    data: { address: 'Carrera 25 # 4 sur 65', lat: 1.2136, lng: -77.2811, orderId },
  });
  expect(created.status()).toBe(201);
  const { deliveryPoint } = (await created.json()) as { deliveryPoint: { id: string } };

  try {
    await page.goto('/dashboard');
    const dispatch = page.getByRole('region', { name: 'Despachar pedidos' });
    const deleteButton = dispatch.getByRole('button', { name: `Eliminar pedido ${orderId}` });
    await expect(deleteButton).toBeVisible();

    page.once('dialog', (dialog) => void dialog.dismiss());
    await deleteButton.click();
    await expect(deleteButton).toBeVisible();

    const deletion = page.waitForResponse(
      (response) => response.url().includes(`/api/v1/pedidos/${deliveryPoint.id}`)
        && response.request().method() === 'DELETE',
    );
    page.once('dialog', (dialog) => void dialog.accept());
    await deleteButton.click();
    expect((await deletion).status()).toBe(204);
    await expect(dispatch.getByText(orderId, { exact: true })).toHaveCount(0);
  } finally {
    await apiRequest(request, 'DELETE', `/api/v1/pedidos/${deliveryPoint.id}`).catch(() => undefined);
  }
});
