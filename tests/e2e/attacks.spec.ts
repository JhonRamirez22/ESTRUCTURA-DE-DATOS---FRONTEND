import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiRequest, E2E_EMAIL, E2E_PASSWORD, loginAsDispatcher } from './auth';
import { mockMapStyle } from './mapStyle';

// Ataques desde el navegador contra la aplicación real. No tocan terceros: los orígenes
// «atacantes» se simulan con rutas de Playwright dentro de esta misma prueba.

const XSS_PAYLOADS = [
  '<script>window.__xss = "script"</script>',
  '"><img src=x onerror="window.__xss=\'img\'">',
  "'><svg onload=\"window.__xss='svg'\">",
  '<iframe srcdoc="<script>parent.__xss=\'iframe\'</script>"></iframe>',
  'javascript:window.__xss="href"',
];

test('XSS almacenado: una solicitud con HTML llega al despachador como texto y no se ejecuta', async ({ page }) => {
  await mockMapStyle(page);
  const request = page.context().request;
  const marker = randomUUID().slice(0, 8);
  const created: string[] = [];
  for (const [index, payload] of XSS_PAYLOADS.entries()) {
    const response = await apiRequest(request, 'POST', '/api/v1/pedidos', {
      data: { address: `${payload} ${marker}-${index}`, lat: 1.2136, lng: -77.2811, orderId: `XSS-${marker}-${index}` },
    });
    // O se rechaza con un error de validación, o se guarda como texto: nunca un 5xx.
    expect(response.status(), await response.text()).toBeLessThan(500);
    if (response.status() === 201) created.push(((await response.json()) as { deliveryPoint: { id: string } }).deliveryPoint.id);
  }
  await page.addInitScript(() => Reflect.set(window, '__xss', undefined));
  await loginAsDispatcher(page);
  await expect(page.getByRole('heading', { name: 'Despacho', exact: true })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => Reflect.get(window, '__xss'))).toBeUndefined();
  // Ningún elemento inyectado: las etiquetas aparecen como texto, no como nodos.
  expect(await page.locator('img[src="x"], svg[onload], iframe[srcdoc]').count()).toBe(0);
  for (const id of created) await apiRequest(request, 'DELETE', `/api/v1/pedidos/${id}`).catch(() => undefined);
});
