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
