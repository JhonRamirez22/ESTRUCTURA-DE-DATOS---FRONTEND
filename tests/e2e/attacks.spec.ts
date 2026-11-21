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

test('la sesión no es legible por scripts y no se guarda en el almacenamiento del navegador', async ({ page }) => {
  await loginAsDispatcher(page);
  const visible = await page.evaluate(() => ({
    cookie: document.cookie,
    local: JSON.stringify(Object.entries(localStorage)),
    session: JSON.stringify(Object.entries(sessionStorage)),
  }));
  expect(visible.cookie).not.toMatch(/session/i);
  expect(`${visible.local}${visible.session}`).not.toMatch(/token|bearer|session/i);
  const cookies = await page.context().cookies();
  const sessionCookies = cookies.filter((cookie) => /session/i.test(cookie.name));
  expect(sessionCookies.length).toBeGreaterThan(0);
  for (const cookie of sessionCookies) {
    expect(cookie.httpOnly, `${cookie.name} debe ser HttpOnly`).toBe(true);
    expect(cookie.sameSite, `${cookie.name} debe ser SameSite=Strict`).toBe('Strict');
  }
});

test('CSRF entre sitios: una página atacante no puede crear pedidos con la sesión del despachador', async ({ page, context }) => {
  await loginAsDispatcher(page);
  const request = context.request;
  const before = (await (await apiRequest(request, 'GET', '/api/v1/pedidos')).json()) as { deliveryPoints: unknown[] };
  const attacker = await context.newPage();
  await attacker.route('http://evil.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>atacante</title>' })
  );
  await attacker.goto('http://evil.test/');
  const base = new URL(page.url()).origin;
  const result = await attacker.evaluate(async (target) => {
    try {
      const response = await fetch(`${target}/api/v1/pedidos`, {
        method: 'POST',
        credentials: 'include',
        mode: 'cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: 'Calle 1 # 1-1', lat: 1.2136, lng: -77.2811, orderId: 'CSRF-ATAQUE' }),
      });
      return { status: response.status };
    } catch (error) {
      return { blocked: String(error) };
    }
  }, base);
  // O el navegador bloquea la petición (CORS) o el servidor la rechaza (401/403). Nunca 201.
  expect(result).not.toMatchObject({ status: 201 });
  const after = (await (await apiRequest(request, 'GET', '/api/v1/pedidos')).json()) as { deliveryPoints: unknown[] };
  expect(after.deliveryPoints.length).toBe(before.deliveryPoints.length);
});

test('formulario hostil: el envío con origen ajeno falla aunque la cookie viaje', async ({ page }) => {
  await loginAsDispatcher(page);
  const response = await page.context().request.post('/api/v1/pedidos', {
    headers: { Origin: 'http://evil.test', 'Content-Type': 'application/json' },
    data: { address: 'Calle 1 # 1-1', lat: 1.2136, lng: -77.2811, orderId: 'ORIGEN-AJENO' },
  });
  expect(response.status()).toBe(403);
});

test('redirección abierta: el retorno tras iniciar sesión nunca sale del sitio', async ({ page }) => {
  for (const target of ['https://evil.example/', '//evil.example/', 'javascript:alert(1)', '/\\evil.example']) {
    await page.goto(`/acceso?retorno=${encodeURIComponent(target)}`);
    await page.locator('#email').fill(E2E_EMAIL);
    await page.locator('#password').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page.waitForURL((url) => url.pathname !== '/acceso', { timeout: 15_000 });
    expect(new URL(page.url()).origin).toBe(new URL(test.info().project.use.baseURL ?? 'http://localhost:3000').origin);
    await apiRequest(page.context().request, 'POST', '/api/v1/auth/logout');
  }
});

test('clickjacking: la aplicación no se deja enmarcar y las cabeceras de seguridad están', async ({ page }) => {
  const response = await page.goto('/acceso');
  const headers = response!.headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('no-referrer');
  expect(headers['strict-transport-security']).toContain('max-age=');
  const policy = headers['content-security-policy'] ?? headers['content-security-policy-report-only'];
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  const attacker = await page.context().newPage();
  await attacker.route('http://evil.test/', (route) =>
    route.fulfill({ contentType: 'text/html', body: `<iframe id="f" src="${new URL(page.url()).origin}/acceso"></iframe>` })
  );
  await attacker.goto('http://evil.test/');
  await attacker.waitForTimeout(1500);
  const framed = await attacker.evaluate(() => {
    const frame = document.getElementById('f') as HTMLIFrameElement;
    try {
      return frame.contentDocument?.body?.innerText.length ?? 0;
    } catch {
      return 0;
    }
  });
  expect(framed).toBe(0);
});

test('la API no revela detalles internos ante entradas rotas', async ({ page }) => {
  await loginAsDispatcher(page);
  const request = page.context().request;
  const bodies = ['{"address":', '[]', 'null', '"x"', '{"address": {"$gt": ""}}', '\u0000'.repeat(10)];
  for (const body of bodies) {
    const response = await apiRequest(request, 'POST', '/api/v1/pedidos', {
      headers: { 'Content-Type': 'application/json' },
      data: body,
    });
    expect(response.status()).toBeLessThan(500);
    const text = await response.text();
    expect(text).not.toMatch(/Traceback|sqlalchemy|asyncpg|File "|\/app\/|postgres/i);
  }
});
