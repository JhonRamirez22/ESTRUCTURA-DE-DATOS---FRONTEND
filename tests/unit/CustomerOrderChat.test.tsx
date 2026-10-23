import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerOrderChat from '@/components/CustomerOrderChat';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

describe('CustomerOrderChat', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('sends the private tracking guide to the backend and renders its scoped reply', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ configured: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: 'Tu pedido ya fue asignado a una ruta.',
          scope: 'order',
          providerNotice: 'Se normaliza la pregunta y se comparte el estado básico del pedido.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    render(<CustomerOrderChat guide="private-tracking-guide" />);

    expect(await screen.findByText('IA configurada')).toBeTruthy();
    expect(
      screen.getByText(/la conexión con el proveedor se confirma al enviar/i)
    ).toBeTruthy();
    const input = await screen.findByRole('textbox', {
      name: 'Escribe tu pregunta sobre el pedido',
    });
