import { apiRequest } from "./auth";
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
    await orderMap.locator('.maplibregl-canvas').click({ position: { x: 280, y: 260 } });
    await page.getByRole('textbox', { name: 'Dirección' }).fill('Cra. 27 #18-09');
    await page.getByLabel('Referencia interna del pedido (opcional)').fill(guide);
    await page
      .getByRole('checkbox', {
        name: 'El cliente acepta recibir avisos por correo sobre su entrega.',
      })
      .check();
    await page
      .getByRole('textbox', { name: 'Correo del cliente' })
      .fill(`cliente-${suffix}@example.com`);
    await page
      .getByRole('checkbox', {
        name: 'El cliente acepta recibir avisos SMS en su celular.',
      })
      .check();
    await page.getByRole('textbox', { name: 'Celular del cliente' }).fill('3001234567');
    await page.getByRole('button', { name: 'Registrar pedido pendiente' }).click();
    await expect(
      page.getByText(new RegExp(`Pedido ${guide} listo\\. Guía privada para el cliente:`))
    ).toBeVisible();

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Rutas en movimiento' })).toBeVisible();
    await expect(page.getByText(guide, { exact: true })).toBeVisible();

    const dispatchSection = page.getByRole('region', { name: 'Despachar pedidos' });
    const pendingSection = dispatchSection
      .getByRole('heading', { name: '1. Pedidos pendientes' })
      .locator('xpath=../../..');
    await pendingSection.getByRole('button', { name: 'Quitar todos' }).click();
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
    expect(routePayload.customerNotifications).toEqual({
      queued: 2,
      channels: {
        email: { queued: 1, configured: false },
        sms: { queued: 1, configured: false },
      },
      warning: 'Configura SMTP y Twilio SMS para entregar los avisos.',
    });
    const notificationStatus = dispatchSection.getByRole('status', {
      name: 'Resumen de avisos a clientes',
    });
    await expect(notificationStatus).toContainText(
      'Ruta creada; canal de aviso pendiente de configuración'
    );
    await expect(notificationStatus).toContainText('2 avisos de asignación quedaron en cola');
    await expect(notificationStatus).toContainText(
      'Abre «Avisos al cliente» para configurar SMTP o Twilio en el backend'
