import { expect, test } from '@playwright/test';
import { loginAsDispatcher } from './auth';

const GUIDE = 'E2E-CUSTOMER-CHAT-GUIDE';
const PROVIDER_NOTICE =
  'Privacidad: la IA recibe solo la intención normalizada y el estado; el texto original no se comparte. ' +
  'No se envían guía, dirección, coordenadas, nombre, teléfono ni IDs. ' +
  'Si preguntas por la llegada, el ETA es aproximado; TomTom, si está disponible, solo cubre ' +
  'parte del primer tramo, no toda la ruta. El chat se limita a este pedido.';

test('el cliente pregunta por su guía y el chat se adapta a móvil', async ({ page }, testInfo) => {
  let chatPayload: unknown;

  await page.route('https://tiles.openfreemap.org/styles/fiord', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        version: 8,
        name: 'estilo de mapa para prueba',
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: { 'background-color': '#17242b' },
          },
        ],
      }),
    })
  );
  await page.route('**/api/v1/seguimiento**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('guia') !== GUIDE) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tracking: {
          guide: GUIDE,
          status: 'PENDING',
          address: 'Carrera 25 # 4 sur 65',
          coordinates: { lat: 1.2136, lng: -77.2811 },
          route: null,
        },
      }),
    });
  });
