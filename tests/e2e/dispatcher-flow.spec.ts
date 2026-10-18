import { apiRequest } from "./auth";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAsCourier, loginAsDispatcher, reportCourierPosition } from "./auth";
import { cleanupTestData } from "./cleanup";

test("crea pedidos, optimiza una ruta y la muestra en el mapa", async ({
  page,
}) => {
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
      const orderId = randomUUID();
      orderIds.push(orderId);
      const orderResponse = await apiRequest(request, "POST", "/api/v1/pedidos", {
        data: {
          address: `E2E parada ${index + 1}`,
          lat: coordinates[0],
          lng: coordinates[1],
          orderId,
        },
      });

      expect(orderResponse.status()).toBe(201);
      const orderPayload = (await orderResponse.json()) as {
        deliveryPoint: { id: string };
      };
      deliveryPointIds.push(orderPayload.deliveryPoint.id);
    }

    const assignmentResponse = await apiRequest(request, "POST", "/api/v1/asignaciones", {
      data: { courierIds: [courierId], deliveryPointIds },
    });

    expect(assignmentResponse.status()).toBe(200);
    const assignmentPayload = (await assignmentResponse.json()) as {
      assignments: Array<{ courierId: string; deliveryPointIds: string[] }>;
    };
    expect(assignmentPayload.assignments).toHaveLength(1);

    const routeResponse = await apiRequest(request, "POST", "/api/v1/asignaciones/aplicar", {
      data: { assignments: assignmentPayload.assignments },
    });

    expect(routeResponse.status()).toBe(201);
    const routePayload = (await routeResponse.json()) as {
      routes: Array<{
        matrixSource: string;
        orderedDeliveryPointIds: string[];
