import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

interface TestDataIds {
  courierId?: string;
  deliveryPointIds?: string[];
  orderIds?: string[];
}

export async function cleanupTestData(ids: TestDataIds): Promise<void> {
  const backendRoot = resolve(
    process.env.PLAYWRIGHT_BACKEND_ROOT ??
      resolve(dirname(fileURLToPath(import.meta.url)), "../../../ESTRUCTURA-DE-DATOS---BACKEND")
  );
  const args = [
    "run",
    "--project",
    backendRoot,
    "python",
    "-m",
    "scripts.e2e_cleanup",
  ];
  for (const courierId of ids.courierId ? [ids.courierId] : []) {
    args.push("--courier-id", courierId);
  }
  for (const deliveryPointId of ids.deliveryPointIds ?? []) {
    args.push("--delivery-point-id", deliveryPointId);
  }
  for (const orderId of ids.orderIds ?? []) {
    args.push("--order-id", orderId);
  }

  try {
    await executeFile("uv", args, { cwd: backendRoot, timeout: 30_000 });
  } catch {
    throw new Error("La limpieza de datos e2e con el backend Python falló.");
  }
}
