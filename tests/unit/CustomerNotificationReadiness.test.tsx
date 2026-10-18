import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import CustomerNotificationReadiness, {
  isCustomerNotificationOperationsStatus,
  type CustomerNotificationOperationsStatus,
} from '@/components/CustomerNotificationReadiness';

const status: CustomerNotificationOperationsStatus = {
  workerRunning: false,
  channels: {
    email: { configured: true, pending: 2, retrying: 1, processing: 0, failed: 1 },
    sms: { configured: false, pending: 0, retrying: 0, processing: 0, failed: 0 },
  },
  warning:
    'Configura Twilio para habilitar SMS. Hay avisos agotados tras varios intentos; requieren revisión operativa.',
};

describe('CustomerNotificationReadiness', () => {
  afterEach(cleanup);

  it('shows channel readiness and queue counts without customer contact data', () => {
    render(<CustomerNotificationReadiness status={status} unavailable={false} />);

    expect(screen.getByRole('region', { name: 'Estado de avisos a clientes' })).toBeTruthy();
    expect(screen.getByText('Correo electrónico')).toBeTruthy();
    expect(screen.getByText('Configurado')).toBeTruthy();
    expect(screen.getByText('Sin configurar')).toBeTruthy();
    expect(screen.getByText('Cómo configurar SMS')).toBeTruthy();
    expect(screen.queryByText('Cómo configurar Correo electrónico')).toBeNull();
    expect(screen.getByText(/requieren revisión operativa/)).toBeTruthy();
    expect(screen.getAllByText('Reintentos')).toHaveLength(2);
    expect(screen.getAllByText('Agotados')).toHaveLength(2);
    expect(screen.getByText('Revisar avisos fallidos')).toBeTruthy();
    expect(
      screen.getByText(/avisos agotados tras varios intentos/)
    ).toBeTruthy();
    expect(
      screen.getByText(/el intento inicial requiere que ese canal esté configurado/i)
    ).toBeTruthy();
  });

  it('distingue el intento inicial de los reintentos automáticos cuando no hay worker', () => {
    render(
      <CustomerNotificationReadiness
        status={{
          ...status,
          warning:
            'Los avisos nuevos se intentan enviar al asignar la ruta o registrar el GPS. El worker persistente está apagado; si un envío falla, no habrá reintento automático.',
          channels: {
            email: { ...status.channels.email, failed: 0 },
            sms: status.channels.sms,
          },
        }}
        unavailable={false}
      />
    );

    expect(screen.getByText('Reintentos automáticos apagados')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('no habrá reintento automático');
    expect(screen.getByRole('status').textContent).not.toContain('seguirán en cola');
  });

  it('informa que el worker de reintentos está activo sin exponer credenciales', () => {
    render(
      <CustomerNotificationReadiness
        status={{
          ...status,
          workerRunning: true,
          warning: null,
          channels: {
            email: { configured: true, pending: 0, retrying: 0, processing: 0, failed: 0 },
            sms: { configured: true, pending: 0, retrying: 0, processing: 0, failed: 0 },
          },
        }}
        unavailable={false}
