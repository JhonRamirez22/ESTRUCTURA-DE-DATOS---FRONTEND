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

  it('obtiene la prueba CSRF antes de escribir y la reutiliza en memoria', async () => {
    network
      .mockResolvedValueOnce(
        Response.json({ authenticated: true }, { headers: { 'X-CSRF-Token': 'proof' } })
      )
      .mockResolvedValue(Response.json({ ok: true }));
    const { apiFetch } = await import('@/lib/apiClient');
    await apiFetch('/api/pedidos', { method: 'POST' });
    await apiFetch('/api/v1/pedidos/one', { method: 'PATCH' });
    expect(network.mock.calls.map((call) => call[0])).toEqual([
      '/api/v1/auth/session',
      '/api/v1/pedidos',
      '/api/v1/pedidos/one',
    ]);
    expect(new Headers(network.mock.calls[1]![1]?.headers).get('X-CSRF-Token')).toBe('proof');
  });

  it('rechaza sesión ausente antes de enviar la mutación', async () => {
    network.mockResolvedValue(Response.json({ authenticated: false }));
    const { apiFetch } = await import('@/lib/apiClient');
    await expect(apiFetch('/api/pedidos', { method: 'POST' })).rejects.toThrow('sesión expiró');
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('limpia CSRF al salir y exige comprobar una nueva sesión', async () => {
    network
      .mockResolvedValueOnce(Response.json({}, { headers: { 'X-CSRF-Token': 'proof' } }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValue(Response.json({ authenticated: false }));
    const { apiFetch } = await import('@/lib/apiClient');
    await apiFetch('/api/auth/logout', { method: 'POST' });
    await expect(apiFetch('/api/pedidos', { method: 'POST' })).rejects.toThrow('sesión expiró');
    expect(network.mock.calls[2]![0]).toBe('/api/v1/auth/session');
  });

  it('no envía cookies ni credenciales a direcciones externas', async () => {
    const { apiFetch } = await import('@/lib/apiClient');
    await expect(apiFetch('https://evil.example/api/')).rejects.toThrow('internas');
    expect(network).not.toHaveBeenCalled();
  });

  it('conserva cancelación y da un error uniforme de red', async () => {
    const { apiFetch, ApiRequestError } = await import('@/lib/apiClient');
    network.mockRejectedValue(new TypeError('network'));
    await expect(apiFetch('/api/pedidos')).rejects.toBeInstanceOf(ApiRequestError);
    const controller = new AbortController();
    controller.abort();
    const cause = new DOMException('cancelled', 'AbortError');
    network.mockRejectedValue(cause);
    await expect(apiFetch('/api/pedidos', { signal: controller.signal })).rejects.toBe(cause);
  });

  it.each([401, 403, 409, 429, 500, 502])('preserva el estado %s y la referencia sin exponer HTML', async (status) => {
    network.mockResolvedValue(new Response('<html>private upstream error</html>', {
      status, headers: { 'Content-Type': 'text/html', 'X-Request-ID': 'safe-reference' },
    }));
    const { apiJson } = await import('@/lib/apiClient');
    await expect(apiJson('/api/rutas')).rejects.toMatchObject({ status, requestId: 'safe-reference' });
    await expect(apiJson('/api/rutas')).rejects.not.toThrow('private upstream');
  });

  it('normaliza también un HTTP 200 que no contiene JSON válido', async () => {
    network.mockImplementation(async () => new Response('upstream HTML', { status: 200 }));
    const { apiJson } = await import('@/lib/apiClient');
    await expect(apiJson('/api/rutas')).rejects.toThrow('respuesta inválida');
  });
});
