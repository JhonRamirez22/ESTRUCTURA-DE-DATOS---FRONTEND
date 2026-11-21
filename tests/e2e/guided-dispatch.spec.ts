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
      const created = await apiRequest(request, 'POST', '/api/v1/pedidos', {
        data: { address: 'Carrera 25 # 4 sur 65', lat, lng, orderId, priority: index === 0 ? 3 : 1 },
      });
      expect(created.status()).toBe(201);
      orderIds.push(orderId);
    }

    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Despacho', exact: true })).toBeVisible();
    const steps = page.getByRole('list', { name: 'Pasos del despacho' });
    await expect(steps).toBeVisible();
    // Quedan marcados los repartidores de esta prueba: el reparto se hace entre todos.
    const mine = page.locator('label').filter({ hasText: `Guía courier ${suffix}` }).locator('input[type="checkbox"]');
    await expect(mine).toHaveCount(2);
    await expect(mine.nth(0)).toBeChecked();
    await expect(mine.nth(1)).toBeChecked();
    // La prioridad del pedido se ve en la lista.
    await expect(page.getByText(new RegExp(`GUIA-${suffix}-0.*Urgente`)).first()).toBeVisible();

    // Se eligen solo los pedidos de esta prueba para que el reparto sea previsible.
    const orders = page.locator('label').filter({ hasText: `GUIA-${suffix}` }).locator('input[type="checkbox"]');
    await expect(orders).toHaveCount(2);
    await expect(orders.nth(0)).toBeChecked();
    const ready = page.getByRole('button', { name: /^Analizar reparto · \d+ pedidos? · \d+ repartidores?/ });
    await expect(ready).toBeEnabled();
    await ready.click();
    await expect(page.getByRole('heading', { name: '3. Propuesta lista para despachar' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Despachar \d+ pedidos? a \d+ repartidores?/ })).toBeEnabled();
    // El contador de pasos llegó a «Revisar y despachar».
    await expect(steps.getByRole('listitem').nth(2)).toHaveAttribute('aria-current', 'step');
  } finally {
    for (const courierId of courierIds) await cleanupTestData({ courierId, orderIds });
  }
});

test('auditoría: el despacho descarga un PDF de repartidor con el periodo elegido', async ({ page }) => {
  await mockMapStyle(page);
  await loginAsDispatcher(page);
  await page.goto('/auditoria');
  await expect(page.getByRole('heading', { name: 'Auditoría de datos' })).toBeVisible();
  const download = page.getByRole('button', { name: 'Descargar PDF' });
  await expect(download).toBeDisabled();

  await page.getByRole('button', { name: 'Despachadores' }).click();
  await page.getByRole('button', { name: 'Elegir' }).first().click();
  await expect(download).toBeEnabled();
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toMatch(/^auditoria-account-\d{8}\.pdf$/);
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(pdf.toString('latin1')).toContain('%%EOF');
  await expect(page.getByText(/Informe descargado/)).toBeVisible();
});
