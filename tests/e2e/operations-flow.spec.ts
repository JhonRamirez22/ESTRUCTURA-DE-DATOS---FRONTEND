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
