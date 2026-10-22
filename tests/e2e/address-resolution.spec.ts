import { expect, test } from '@playwright/test';
import { loginAsDispatcher } from './auth';

test('busca una dirección escrita sin pin y permite confirmar una aproximación', async ({ page }) => {
  await loginAsDispatcher(page);
  let input: unknown;
  await page.route('**/api/v1/direcciones/resolver', async route => {
    input = route.request().postDataJSON();
    await route.fulfill({ json: {
      candidates: [{ address: 'Carrera 25 con Calle 3, Pasto', lat: 1.21, lng: -77.28,
        precision: 'intersection' }], source: 'tomtom',
      warning: 'Ubicación aproximada o intersección: confirma el punto antes de guardar.',
