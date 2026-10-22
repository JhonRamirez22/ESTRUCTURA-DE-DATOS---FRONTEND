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
