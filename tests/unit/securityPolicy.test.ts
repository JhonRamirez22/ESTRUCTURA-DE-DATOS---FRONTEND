import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

afterEach(() => vi.unstubAllEnvs());

it('genera un nonce diferente por documento y comienza en modo reporte', () => {
  vi.stubEnv('CSP_MODE', 'report-only');
  const first = middleware(new NextRequest('https://app.example/dashboard'));
  const second = middleware(new NextRequest('https://app.example/dashboard'));
  const policy = first.headers.get('Content-Security-Policy-Report-Only');
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).toContain("worker-src 'self'");
  expect(policy).toContain('https://tiles.openfreemap.org');
  expect(policy).toContain("frame-ancestors 'none'");
  expect(second.headers.get('Content-Security-Policy-Report-Only')).not.toBe(policy);
  expect(first.headers.get('Cache-Control')).toContain('no-store');
});

it('permite aplicar la política después de verificar compatibilidad', () => {
  vi.stubEnv('CSP_MODE', 'enforce');
  const response = middleware(new NextRequest('https://app.example/dashboard'));
  expect(response.headers.get('Content-Security-Policy')).toContain("object-src 'none'");
  expect(response.headers.has('Content-Security-Policy-Report-Only')).toBe(false);
});

it('en producción no permite eval ni scripts inline arbitrarios', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CSP_MODE', 'enforce');
  const policy = middleware(new NextRequest('https://app.example/')).headers.get('Content-Security-Policy')!;
  expect(policy).not.toContain("'unsafe-eval'");
  expect(policy.split('; ').find((directive) => directive.startsWith('script-src '))).not.toContain("'unsafe-inline'");
  expect(policy).toContain('upgrade-insecure-requests');
});
