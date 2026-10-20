import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { E2E_AUTH_SECRET, E2E_DISPATCHER_CODE } from './tests/e2e/auth';

const frontendRoot = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(
  process.env.PLAYWRIGHT_BACKEND_ROOT ?? resolve(frontendRoot, '../ESTRUCTURA-DE-DATOS---BACKEND')
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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/orsMockServer.mjs',
      cwd: frontendRoot,
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: `uv run --project . python -m scripts.seed_e2e_accounts && uv run --project . uvicorn app.main:app --host 127.0.0.1 --port ${pythonApiPort}`,
      cwd: backendRoot,
      url: `http://127.0.0.1:${pythonApiPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NODE_ENV: 'test',
        ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
        APP_ALLOWED_ORIGINS: JSON.stringify([new URL(baseURL).origin]),
        AUTH_SECRET: E2E_AUTH_SECRET,
        DISPATCHER_ACCESS_CODE: E2E_DISPATCHER_CODE,
        OSRM_API_URL: 'http://127.0.0.1:4010',
        AI_TRAFFIC_API_KEY: '',
        AI_TRAFFIC_API_URL: '',
        AI_TRAFFIC_MODEL: '',
        AI_ALLOW_LOCATION_DATA_SHARING: 'false',
        TOMTOM_API_KEY: '',
      },
    },
    {
      command: process.env.PLAYWRIGHT_PRODUCTION === '1' ? 'node .next/standalone/server.js' : 'pnpm dev',
      cwd: frontendRoot,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        NODE_ENV: process.env.PLAYWRIGHT_PRODUCTION === '1' ? 'production' : 'test',
        APP_ALLOWED_ORIGINS: JSON.stringify([new URL(baseURL).origin]),
        AI_TRAFFIC_API_KEY: '',
        AI_TRAFFIC_API_URL: '',
        AI_TRAFFIC_MODEL: '',
        AI_ALLOW_LOCATION_DATA_SHARING: 'false',
        TOMTOM_API_KEY: '',
        NOTIFICATION_SMTP_HOST: '',
        NOTIFICATION_SMTP_USERNAME: '',
        NOTIFICATION_SMTP_PASSWORD: '',
        NOTIFICATION_FROM_EMAIL: '',
        NOTIFICATION_SMS_TWILIO_ACCOUNT_SID: '',
        NOTIFICATION_SMS_TWILIO_AUTH_TOKEN: '',
        NOTIFICATION_SMS_TWILIO_FROM_PHONE: '',
        AUTH_SECRET: E2E_AUTH_SECRET,
        DISPATCHER_ACCESS_CODE: E2E_DISPATCHER_CODE,
        OSRM_API_URL: 'http://127.0.0.1:4010',
        PYTHON_API_HOST: '127.0.0.1',
        PYTHON_API_PORT: pythonApiPort,
        PYTHON_API_URL: pythonApiURL,
        PYTHON_RELOAD: '0',
        NEXT_DEV_HOSTNAME: '127.0.0.1',
        HOSTNAME: '127.0.0.1',
        PORT: appPort,
      },
    },
  ],
});
