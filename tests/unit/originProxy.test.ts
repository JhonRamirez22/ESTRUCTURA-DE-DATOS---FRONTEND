import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { middleware } from '@/middleware';

const SECRET = 'origen-compartido-con-el-backend-32-bytes';

describe('proxy de /api con secreto de origen', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.PYTHON_API_URL = 'https://api.example.test';
    process.env.ORIGIN_AUTH_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('reenvía al backend con el secreto y conserva ruta y consulta', () => {
    const response = middleware(new NextRequest('https://app.example.test/api/v1/seguimiento?guia=abc'));
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://api.example.test/api/v1/seguimiento?guia=abc');
    expect(response.headers.get('x-middleware-request-x-origin-auth')).toBe(SECRET);
  });

  it('reemplaza un X-Origin-Auth enviado por el cliente', () => {
    const request = new NextRequest('https://app.example.test/api/v1/pedidos', { headers: { 'x-origin-auth': 'inventado' } });
    expect(middleware(request).headers.get('x-middleware-request-x-origin-auth')).toBe(SECRET);
  });

  it('nunca expone el secreto en la respuesta al navegador', () => {
    const response = middleware(new NextRequest('https://app.example.test/api/v1/health'));
    const visible = [...response.headers.entries()].filter(([name]) => !name.startsWith('x-middleware-'));
    expect(JSON.stringify(visible)).not.toContain(SECRET);
  });

  it('sin secreto deja que next.config reenvíe (desarrollo local)', () => {
    delete process.env.ORIGIN_AUTH_SECRET;
    const response = middleware(new NextRequest('http://localhost:3000/api/v1/health'));
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('las páginas siguen recibiendo la CSP y no pasan por el backend', () => {
    const response = middleware(new NextRequest('https://app.example.test/dashboard'));
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('Content-Security-Policy-Report-Only') ?? response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
  });
});
