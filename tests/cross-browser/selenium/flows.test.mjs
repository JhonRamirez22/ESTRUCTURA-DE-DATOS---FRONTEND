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
