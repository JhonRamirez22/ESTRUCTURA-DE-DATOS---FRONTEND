import type { Page } from '@playwright/test';

const DARK_TEST_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
  'base64',
);

/** El flujo de negocio prueba capas y coordenadas, sin depender de la red de teselas. */
export async function mockMapStyle(page: Page): Promise<void> {
  await page.route('https://tiles.openfreemap.org/e2e-fonts/**', (route) =>
    route.fulfill({ body: Buffer.alloc(0), contentType: 'application/x-protobuf' }),
  );
  await page.route('https://tiles.openfreemap.org/e2e-raster/**', (route) =>
