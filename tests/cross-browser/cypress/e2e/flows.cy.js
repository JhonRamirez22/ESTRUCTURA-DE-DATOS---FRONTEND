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
    login(Cypress.env('DISPATCHER_EMAIL'));
    cy.location('pathname', { timeout: 20000 }).should('eq', '/dashboard');
    cy.contains('h1', 'Despacho').should('be.visible');
    cy.get('[role="tablist"]').contains('Pedidos').should('be.visible');
    cy.get('[role="tablist"]').contains('Rutas').click();
    cy.contains('[role="tab"]', 'Rutas').should('have.attr', 'aria-selected', 'true');
  });

  it('2. el repartidor inicia sesión y ve su ruta y la acción principal', () => {
    login(Cypress.env('COURIER_EMAIL'));
    cy.location('pathname', { timeout: 20000 }).should('eq', '/repartidor');
    cy.contains('Iniciar ubicación').should('be.visible');
  });

  it('3. un cliente sigue su pedido con la guía', () => {
    cy.visit('/cliente?guia=guia-carga-0-0');
