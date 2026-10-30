import { expect, test } from '@playwright/test';
import { loginAsDispatcher } from './auth';
import { mockMapStyle } from './mapStyle';

test('CSP permite hidratar, iniciar sesión y mostrar el mapa sin violaciones', async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.set(window, '__policyViolations', []);
    document.addEventListener('securitypolicyviolation', (event) => {
      Reflect.get(window, '__policyViolations').push(event.effectiveDirective);
    });
  });
  await mockMapStyle(page);
  const response = await page.goto('/');
  const headers = response!.headers();
  const policy = headers['content-security-policy'] ?? headers['content-security-policy-report-only'];
  expect(policy).toContain("'strict-dynamic'");
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1];
  expect(nonce).toBeTruthy();
  expect(await page.locator('script[nonce]').first().evaluate((script) => (script as HTMLScriptElement).nonce)).toBe(nonce);
  await loginAsDispatcher(page);
  const map = page.getByRole('region', { name: 'Mapa de rutas' });
  await expect(map.locator('.maplibregl-canvas')).toBeVisible();
  await expect(map.getByRole('status', { name: 'Carga del mapa' })).toHaveCount(0, { timeout: 15000 });
  expect(await page.evaluate(() => Reflect.get(window, '__policyViolations'))).toEqual([]);
});

