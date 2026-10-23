import { expect, test } from '@playwright/test';

test('la portada separa el acceso operativo del seguimiento y se adapta a móvil', async ({
  page,
}, testInfo) => {
  const response = await page.goto('/');
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['permissions-policy']).toContain('geolocation=(self)');
  expect(headers['strict-transport-security']).toContain('max-age=31536000');

  await expect(
    page.getByRole('heading', { name: 'Del pedido pendiente a la puerta, sin perder el hilo.' })
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: '¿Qué necesitas hacer?' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Información útil, ligada a tu pedido' })
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Rutas por calles, con un orden que se puede explicar.' })
  ).toBeVisible();
