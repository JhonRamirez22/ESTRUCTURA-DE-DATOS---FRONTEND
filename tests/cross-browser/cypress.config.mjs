import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: process.env.BASE_URL ?? 'http://localhost:3100',
    supportFile: false,
    video: false,
    screenshotOnRunFailure: false,
