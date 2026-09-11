import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: currentDirectory,
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    setupFiles: [resolve(currentDirectory, './tests/setup.ts')],
    include: [
      'tests/unit/**/*.test.ts',
