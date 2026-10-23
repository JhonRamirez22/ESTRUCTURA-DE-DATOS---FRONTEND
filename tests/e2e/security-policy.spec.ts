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
