import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiRequest, loginAsDispatcher, reportCourierPosition } from './auth';
import { cleanupTestData } from './cleanup';
import { mockMapStyle } from './mapStyle';

test('despacho guiado: repartidores marcados por defecto, motivo del botón y reparto entre dos', async ({ page }) => {
  test.setTimeout(120_000);
  await mockMapStyle(page);
  await loginAsDispatcher(page);
  const request = page.context().request;
  const suffix = randomUUID().slice(0, 8);
  const courierIds: string[] = [];
  const orderIds: string[] = [];
  try {
    for (const [index, lat] of [1.2136, 1.2196].entries()) {
      // reportCourierPosition cierra sesiones: el despacho vuelve a ingresar antes de cada alta.
      if (index > 0) await loginAsDispatcher(page);
      const response = await apiRequest(request, 'POST', '/api/v1/repartidores', {
        data: { name: `Guía courier ${suffix}-${index}`, phone: `+57302${Date.now().toString().slice(-7)}${index}`.slice(0, 13) },
      });
      expect(response.status()).toBe(201);
      const payload = (await response.json()) as { courier: { id: string }; accessCode: string };
      courierIds.push(payload.courier.id);
      await reportCourierPosition(page, payload.accessCode, lat, -77.2811);
    }
    await loginAsDispatcher(page);
    for (const [index, [lat, lng]] of [[1.2142, -77.279], [1.2202, -77.2805]].entries()) {
      const orderId = `GUIA-${suffix}-${index}`;
