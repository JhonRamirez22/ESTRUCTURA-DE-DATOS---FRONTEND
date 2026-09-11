import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { E2E_AUTH_SECRET, E2E_DISPATCHER_CODE } from './tests/e2e/auth';

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(
  process.env.PLAYWRIGHT_BACKEND_ROOT ?? resolve(frontendRoot, '../../BACKEND/ESTRUCTURA-DE-DATOS---BACKEND')
);
if (!existsSync(resolve(backendRoot, 'pyproject.toml'))) {
  throw new Error('Define PLAYWRIGHT_BACKEND_ROOT para apuntar al repositorio backend local.');
}
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const appPort = new URL(baseURL).port || '3000';
const pythonApiPort = process.env.PYTHON_API_PORT?.trim() || '8000';
const pythonApiURL = process.env.PYTHON_API_URL?.trim() || 'http://127.0.0.1:' + pythonApiPort;
const useSystemChrome = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === '1';

export default defineConfig({
  testDir: resolve(frontendRoot, './tests/e2e'),
  outputDir: resolve(frontendRoot, 'test-results'),
  // Ambos flujos usan la misma PostgreSQL y el dashboard opera sobre las
  // colas globales de pedidos; paralelizarlos mezcla los datos de prueba.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { outputFolder: resolve(frontendRoot, 'playwright-report') }]],
  use: {
    baseURL,
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    ...(useSystemChrome ? { launchOptions: { channel: 'chrome' as const } } : {}),
  },
