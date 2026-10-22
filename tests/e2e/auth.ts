import type { APIRequestContext, Page } from '@playwright/test';

export async function apiRequest(
  request: APIRequestContext,
  method: string,
  path: string,
  options: Parameters<APIRequestContext['fetch']>[1] = {}
) {
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').origin;
  const headers: Record<string, string> = { ...options.headers, Origin: origin };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !path.endsWith('/auth/login')) {
    const session = await request.get('/api/v1/auth/session');
    const proof = session.headers()['x-csrf-token'];
    if (proof) headers['X-CSRF-Token'] = proof;
  }
  return request.fetch(path, { ...options, method, headers });
}

export const E2E_AUTH_SECRET = 'rutas-pasto-e2e-session-secret-32-bytes-minimum';
export const E2E_DISPATCHER_CODE = 'rutas-pasto-e2e-dispatcher-code-32-chars';
export const E2E_EMAIL = 'dispatcher@rutas-pasto.example';
export const E2E_PASSWORD = 'rutas-pasto-e2e-private-password';

export async function loginAsDispatcher(page: Page): Promise<void> {
  await page.goto('/acceso');
  await expectNoPublicRoleSelector(page);
  await page.locator('#email').fill(E2E_EMAIL);
  await page.locator('#password').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('**/dashboard');
