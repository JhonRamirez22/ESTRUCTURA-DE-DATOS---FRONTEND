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
  await expect(page.getByRole('heading', { name: 'Mejora local con 2-opt' })).toBeVisible();
  await expect(page.getByText(/no una garantía de óptimo/)).toBeVisible();
  await expect(page.getByText(/listas dobles para cachés LRU/)).toBeVisible();
  await expect(page.getByText(/correo, SMS o ambos/)).toBeVisible();
  await expect(page.getByText(/no se envía el texto libre original/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Soy repartidor o despachador/ })).toHaveAttribute(
    'href',
    '/acceso'
  );
  await expect(page.getByRole('link', { name: /Soy cliente/ })).toHaveAttribute('href', '/cliente');

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: '¿Qué necesitas hacer?' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
  for (const [width, name] of [[1440, 'desktop'], [390, 'mobile']] as const) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/');
    await expect(page.locator('.rp-brand')).toHaveCount(1);
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await page.screenshot({ path: testInfo.outputPath(`home-${name}.png`), fullPage: true, animations: 'disabled' });
  }
});

test('respeta reducir movimiento sin quitar el feedback de color de las acciones', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const action = page.getByRole('link', { name: /Soy repartidor o despachador/ });
  const arrow = action.locator('.rp-entry-arrow');
  await expect(action).toBeVisible();
  await expect
    .poll(() => arrow.evaluate((element) => getComputedStyle(element).transitionProperty))
    .toBe('none');
  await expect
    .poll(() => action.evaluate((element) => getComputedStyle(element).transitionDuration))
    .toBe('0.2s');
});
