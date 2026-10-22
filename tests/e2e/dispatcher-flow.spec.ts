import { apiRequest } from "./auth";
import { mockMapStyle } from './mapStyle';
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAsCourier, loginAsDispatcher, reportCourierPosition } from "./auth";
import { cleanupTestData } from "./cleanup";

test("crea pedidos, optimiza una ruta y la muestra en el mapa", async ({
  page,
}) => {
  await mockMapStyle(page);
  await loginAsDispatcher(page);
  const request = page.context().request;
  const suffix = randomUUID();
  const courierResponse = await apiRequest(request, "POST", "/api/v1/repartidores", {
    data: {
      name: `E2E courier ${suffix}`,
      phone: `+57300${Date.now().toString().slice(-7)}`,
    },
  });

  expect(courierResponse.status()).toBe(201);
  const courierPayload = (await courierResponse.json()) as {
    courier: { id: string };
    accessCode: string;
  };
  const courierId = courierPayload.courier.id;
  const courierAccessCode = courierPayload.accessCode;
  const deliveryPointIds: string[] = [];
  const orderIds: string[] = [];

  try {
    await reportCourierPosition(page, courierAccessCode);
    await loginAsDispatcher(page);

    for (const [index, coordinates] of [
      [1.214, -77.28],
      [1.215, -77.279],
      [1.216, -77.278],
      [1.217, -77.277],
      [1.218, -77.276],
    ].entries()) {
