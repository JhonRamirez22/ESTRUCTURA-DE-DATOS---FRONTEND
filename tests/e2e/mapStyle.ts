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
    route.fulfill({ body: DARK_TEST_TILE, contentType: 'image/png' }),
  );
  await page.route('https://tiles.openfreemap.org/styles/**', (route) =>
    route.fulfill({
      json: {
        version: 8,
        glyphs: 'https://tiles.openfreemap.org/e2e-fonts/{fontstack}/{range}.pbf',
        sources: {
          'e2e-raster': {
            type: 'raster',
            tiles: ['https://tiles.openfreemap.org/e2e-raster/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 0,
          },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#17242b' } },
          { id: 'e2e-raster', type: 'raster', source: 'e2e-raster' },
        ],
      },
    }),
  );
  await page.route('https://a.basemaps.cartocdn.com/**', (route) => route.abort());
}
