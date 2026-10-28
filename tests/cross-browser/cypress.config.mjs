import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: process.env.BASE_URL ?? 'http://localhost:3100',
    supportFile: false,
    video: false,
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 30000,
    env: {
      DISPATCHER_EMAIL: process.env.DISPATCHER_EMAIL ?? 'd0@carga.co',
      COURIER_EMAIL: process.env.COURIER_EMAIL ?? 'c0@carga.co',
      PASSWORD: process.env.LOAD_PASSWORD ?? 'Carga-Masiva-2026-Zz1',
    },
  },
});
