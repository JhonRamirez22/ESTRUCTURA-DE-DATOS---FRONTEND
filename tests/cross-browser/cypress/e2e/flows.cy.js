// Cuatro flujos clave con Cypress. Requieren la aplicación y la API en marcha y cuentas de
// prueba (ver tests/load/seed_load_data.py en el backend).
// Cypress inyecta scripts en el <head> del documento (document.domain) y eso desajusta la
// hidratación de React. Playwright y Selenium, que no modifican el HTML, no la ven: se comprobó
// con Playwright (chrome, contexto limpio, 0 errores de consola). Solo se ignora ese error.
Cypress.on('uncaught:exception', (error) => !/Hydration failed|Minified React error #(418|423|425)/.test(error.message));

const login = (email) => {
  cy.visit('/acceso');
  cy.get('#email').type(email);
  cy.get('#password').type(Cypress.env('PASSWORD'), { log: false });
  cy.contains('button', 'Ingresar').click();
};

describe('flujos clave', () => {
  it('1. el despachador inicia sesión y ve su panel con la hoja de despacho', () => {
