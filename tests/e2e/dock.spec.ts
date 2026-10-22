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
