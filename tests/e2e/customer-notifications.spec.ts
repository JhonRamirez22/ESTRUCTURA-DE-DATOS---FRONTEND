import { apiRequest } from "./auth";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAsCourier, loginAsDispatcher, reportCourierPosition } from "./auth";
import { cleanupTestData } from "./cleanup";

const COURIER_LOCATION = { lat: 1.2136, lng: -77.2811 };

interface ChannelCounts {
  configured: boolean;
  pending: number;
  retrying: number;
  processing: number;
  failed: number;
}

interface NotificationStatus {
  channels: {
    email: ChannelCounts;
    sms: ChannelCounts;
  };
}

test("avisa por correo y SMS al asignar y al acercarse el repartidor", async ({ page }) => {
  await loginAsDispatcher(page);
  const request = page.context().request;
  const suffix = randomUUID();
  const orderId = `E2E-NOTIFICATION-${suffix}`;
  let courierId: string | undefined;
  let deliveryPointId: string | undefined;

  try {
    const courierResponse = await apiRequest(request, "POST", "/api/v1/repartidores", {
      data: {
        name: `Notification courier ${suffix}`,
        phone: `+57302${Date.now().toString().slice(-7)}`,
      },
    });
    expect(courierResponse.status()).toBe(201);
    const courier = (await courierResponse.json()) as {
      courier: { id: string };
      accessCode: string;
    };
    courierId = courier.courier.id;
    await reportCourierPosition(page, courier.accessCode, COURIER_LOCATION.lat, COURIER_LOCATION.lng);
    await loginAsDispatcher(page);

    const orderResponse = await apiRequest(request, "POST", "/api/v1/pedidos", {
      data: {
        address: "Carrera 25 # 4 sur 65, Pasto",
        ...COURIER_LOCATION,
        orderId,
        customerEmail: `customer-${suffix}@example.invalid`,
        emailNotificationsEnabled: true,
        customerPhone: "+573001234567",
        smsNotificationsEnabled: true,
      },
    });
    expect(orderResponse.status()).toBe(201);
    const order = (await orderResponse.json()) as {
      deliveryPoint: { id: string };
    };
    deliveryPointId = order.deliveryPoint.id;

    const statusBefore = await readNotificationStatus(request);
    const routeResponse = await apiRequest(request, "POST", "/api/v1/asignaciones/aplicar", {
      data: {
        assignments: [{ courierId, deliveryPointIds: [deliveryPointId] }],
      },
