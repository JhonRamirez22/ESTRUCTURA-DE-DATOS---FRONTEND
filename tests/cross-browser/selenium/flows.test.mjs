// Los mismos flujos con Selenium WebDriver (Chrome sin cabeza). Selenium Manager descarga el
// controlador que corresponde al Chrome instalado.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Builder, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const PASSWORD = process.env.LOAD_PASSWORD ?? 'Carga-Masiva-2026-Zz1';
let driver;

async function login(email) {
  await driver.manage().deleteAllCookies();
  await driver.get(`${BASE}/acceso`);
  await driver.findElement(By.css('#email')).sendKeys(email);
  await driver.findElement(By.css('#password')).sendKeys(PASSWORD);
  await driver.findElement(By.xpath("//button[contains(., 'Ingresar')]")).click();
}

const pathOf = async () => new URL(await driver.getCurrentUrl()).pathname;

describe('flujos clave (Selenium)', () => {
  before(async () => {
    const options = new chrome.Options().addArguments('--headless=new', '--window-size=1280,900', '--no-sandbox');
    driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 60000 });
  });
  after(async () => driver?.quit());

  it('1. el despachador inicia sesión y ve la hoja de despacho', async () => {
    await login(process.env.DISPATCHER_EMAIL ?? 'd1@carga.co');
    await driver.wait(async () => (await pathOf()) === '/dashboard', 45000);
    // La página muestra «Verificando acceso» mientras valida la sesión; se espera al título real.
    await driver.wait(async () => /Despacho/.test(await driver.findElement(By.css('h1')).getText()), 45000);
    const tabs = await driver.wait(until.elementLocated(By.css('[role="tablist"]')), 45000);
    assert.match(await tabs.getText(), /Pedidos/);
  });

  it('2. el repartidor inicia sesión y ve iniciar ubicación', async () => {
    await login(process.env.COURIER_EMAIL ?? 'c1@carga.co');
    await driver.wait(async () => (await pathOf()) === '/repartidor', 45000);
    const button = await driver.wait(until.elementLocated(By.xpath("//button[contains(., 'Iniciar ubicación')]")), 45000);
    assert.ok(await button.isDisplayed());
  });

  it('3. un cliente sigue su pedido con la guía', async () => {
    await driver.manage().deleteAllCookies();
    await driver.get(`${BASE}/cliente?guia=guia-carga-1-0`);
    const address = await driver.wait(until.elementLocated(By.xpath("//*[contains(text(), 'Calle 1 # 0-10')]")), 45000);
    assert.ok(await address.isDisplayed());
  });

  it('4. la solicitud pública muestra el formulario de entrega', async () => {
    await driver.get(`${BASE}/solicitar`);
    const form = await driver.wait(until.elementLocated(By.css('form#request-form')), 45000);
    assert.ok(await form.isDisplayed());
  });

  it('5. sin sesión, /dashboard redirige al acceso', async () => {
    await driver.manage().deleteAllCookies();
    await driver.get(`${BASE}/dashboard`);
    await driver.wait(async () => ['/acceso', '/'].includes(await pathOf()), 45000);
  });
});
