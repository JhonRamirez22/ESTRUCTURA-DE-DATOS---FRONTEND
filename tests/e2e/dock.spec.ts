import { expect, test } from '@playwright/test';

test('el dock tiene destinos reales, foco y magnificación sin desbordar', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: 'Accesos rápidos', exact: true });
  const staff = dock.getByRole('link', { name: 'Personal', exact: true });
  await expect(staff).toHaveAttribute('href', '/acceso');
  await expect(dock.getByRole('link', { name: 'Seguimiento', exact: true })).toHaveAttribute(
    'href',
    '/cliente'
  );
  await expect(dock.locator('[role="button"]')).toHaveCount(0);
  await staff.focus();
  await expect(dock.locator('.ui-dock-label')).toContainText('Personal');
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  const item = staff.locator('..');
  await expect.poll(async () => (await item.boundingBox())!.width).toBeLessThan(45);
  await staff.hover();
  await expect.poll(async () => (await item.boundingBox())!.width).toBeGreaterThan(50);
  await page.screenshot({ path: testInfo.outputPath('dock-desktop.png') });
  await staff.click();
  await page.waitForURL('**/acceso');
  await expect(page.getByRole('heading', { name: 'Ingresar al sistema' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(320);
  expect(errors).toEqual([]);
});

test('reducir movimiento conserva el dock estático y el login funciona', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/acceso');
  const dock = page.getByRole('navigation', { name: 'Accesos rápidos', exact: true });
  const staff = dock.getByRole('link', { name: 'Personal', exact: true });
  await staff.hover();
  await expect.poll(async () => (await staff.locator('..').boundingBox())!.width).toBe(44);
  await page.getByLabel('Contraseña', { exact: true }).fill('contraseña de prueba');
  await page.getByRole('button', { name: 'Mostrar contraseña' }).click();
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar contraseña' }).click();
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'password');
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.screenshot({ path: testInfo.outputPath('login-mobile.png'), fullPage: true });
});
