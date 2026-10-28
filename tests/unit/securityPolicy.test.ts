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
