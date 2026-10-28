import { vi } from 'vitest'
import { MotionGlobalConfig } from 'framer-motion'

// Happy DOM cancela WAAPI al desmontar; Vitest prueba estados y Playwright las animaciones reales.
MotionGlobalConfig.skipAnimations = true

// CI puede inyectar su propia URL; local usa el puerto del Postgres de Compose.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/rutas_pasto?schema=public'
}

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
