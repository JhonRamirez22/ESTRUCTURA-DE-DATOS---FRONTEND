import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const network = vi.fn<typeof fetch>();

describe('cliente HTTP versionado', () => {
  beforeEach(() => {
    vi.resetModules();
    network.mockReset();
    vi.stubGlobal('fetch', network);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('versiona, envía cookie y requestId sin guardar el token en JavaScript', async () => {
    network.mockResolvedValue(Response.json({ ok: true }));
    const { apiFetch } = await import('@/lib/apiClient');
    await apiFetch('/api/pedidos');
    const [url, options] = network.mock.calls[0]!;
    expect(url).toBe('/api/v1/pedidos');
    expect(options?.credentials).toBe('same-origin');
    expect(new Headers(options?.headers).get('X-Request-ID')).toMatch(/^[a-f0-9-]{36}$/);
    expect(new Headers(options?.headers).has('Authorization')).toBe(false);
  });

  it('envía el token de acceso como Bearer tras iniciar sesión, sin pedir CSRF', async () => {
    network
      .mockResolvedValueOnce(
        Response.json(
          { authenticated: true, redirectTo: '/dashboard', accessToken: 'tok-123' },
