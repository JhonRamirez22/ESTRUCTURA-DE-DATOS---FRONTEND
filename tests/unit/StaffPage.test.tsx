import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StaffPage from '@/app/personal/page';

vi.mock('next/navigation', () => ({ usePathname: () => '/personal' }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockApi() {
  const team = [
    { id: 'c1', name: 'Laura Pérez', phone: '3001112233', status: 'OFFLINE', lastLocationAt: null },
    { id: 'c-history', name: 'Andrés Rosero', phone: '3002223344', status: 'OFFLINE', lastLocationAt: null },
  ];
  const request = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, 'http://localhost').pathname;
    if (path.endsWith('/auth/session')) {
      return Response.json({ authenticated: true }, { headers: { 'X-CSRF-Token': 'proof' } });
    }
    if (init?.method === 'DELETE') {
      const id = path.split('/').pop();
      if (id === 'c-history') return Response.json({ error: 'Con rutas.' }, { status: 409 });
      const index = team.findIndex((item) => item.id === id);
      if (index >= 0) team.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/repartidores') && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { name: string; phone: string };
      team.push({ id: 'c2', name: body.name, phone: body.phone, status: 'OFFLINE', lastLocationAt: null });
      return Response.json({ courier: team.at(-1) }, { status: 201 });
    }
    return Response.json({ couriers: team });
  });
  vi.stubGlobal('fetch', request);
  return request;
}

function fill(name: string, value: string) {
  fireEvent.change(screen.getByLabelText(name, { exact: false }), { target: { value } });
}

it('lista el equipo y registra un repartidor con su cuenta', async () => {
  const request = mockApi();
  await act(async () => render(<StaffPage />));
  expect(screen.getByText('Laura Pérez')).toBeInTheDocument();

  fill('Nombre completo', 'Camila Ramírez');
  fill('Teléfono', '300 123 4567');
  fill('Correo electrónico', 'Camila@Empresa.com');
  fill('Contraseña', 'una-clave-larga-segura');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Registrar repartidor' })));

  const create = request.mock.calls.find(([, init]) => init?.method === 'POST' && String(init.body).includes('Camila'));
  expect(JSON.parse(String(create?.[1]?.body))).toEqual({
    name: 'Camila Ramírez',
    phone: '300 123 4567',
    account: { email: 'camila@empresa.com', password: 'una-clave-larga-segura' },
  });
  expect(screen.getByRole('status')).toHaveTextContent('Camila Ramírez ya puede ingresar');
  expect(screen.getByText('Camila Ramírez')).toBeInTheDocument();
});

it('no envía nada si el correo o la contraseña no cumplen', async () => {
  const request = mockApi();
  await act(async () => render(<StaffPage />));
  fill('Nombre completo', 'Camila Ramírez');
  fill('Teléfono', '3001234567');
  fill('Correo electrónico', 'camila-sin-arroba');
  fill('Contraseña', 'corta');
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Registrar repartidor' })));

  expect(screen.getByRole('alert')).toHaveTextContent('correo válido');
  expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
});

it('elimina un repartidor solo tras confirmar y explica cuando tiene historial', async () => {
  const request = mockApi();
  await act(async () => render(<StaffPage />));
  const deletes = () => request.mock.calls.filter(([, init]) => init?.method === 'DELETE');

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Laura Pérez' }));
  fireEvent.click(screen.getByRole('button', { name: 'Conservar' }));
  expect(deletes()).toHaveLength(0);

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Laura Pérez' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' })));
  expect(deletes()).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveTextContent('Laura Pérez fue eliminado');
  expect(screen.queryByText('Laura Pérez')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Eliminar a Andrés Rosero' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' })));
  expect(screen.getByRole('alert')).toHaveTextContent('tiene rutas en su historial');
  expect(screen.getByText('Andrés Rosero')).toBeInTheDocument();
});
