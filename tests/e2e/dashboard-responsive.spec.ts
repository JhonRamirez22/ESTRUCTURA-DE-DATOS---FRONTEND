import { expect, test, type Page } from "@playwright/test";
import { loginAsDispatcher } from "./auth";
import { mockMapStyle } from './mapStyle';

async function mockDashboardData(page: Page): Promise<void> {
  await mockMapStyle(page);
  const now = new Date().toISOString();
  const activeCourier = {
    id: "e2e-courier-active",
    name: "Repartidor de prueba",
    phone: "+573000000001",
    status: "ON_ROUTE",
    currentLat: 1.2142,
    currentLng: -77.2804,
    lastLocationAt: now,
  };
  const availableCourier = {
    id: "e2e-courier-available",
    name: "Repartidor disponible",
    phone: "+573000000002",
    status: "AVAILABLE",
    currentLat: 1.2136,
    currentLng: -77.2811,
    lastLocationAt: now,
  };
  const activeStop = {
    id: "e2e-active-stop",
    orderId: "E2E-ACTIVE-001",
    address: "Calle de Prueba 10 # 2-03, Pasto",
    lat: 1.215,
    lng: -77.2798,
    status: "EN_ROUTE",
    sequenceIndex: 0,
  };

  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;

    if (url.pathname === "/api/v1/repartidores" && route.request().method() === "GET") {
      body = { couriers: [activeCourier, availableCourier] };
    } else if (url.pathname === "/api/v1/notificaciones/clientes/estado") {
      body = {
        channels: {
          email: { configured: false, pending: 0, retrying: 0, processing: 0, failed: 0 },
          sms: { configured: false, pending: 0, retrying: 0, processing: 0, failed: 0 },
        },
