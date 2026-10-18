export interface CustomerNotificationChannelStatus {
  configured: boolean;
  pending: number;
  retrying: number;
  processing: number;
  failed: number;
}

export interface CustomerNotificationOperationsStatus {
  channels: {
    email: CustomerNotificationChannelStatus;
    sms: CustomerNotificationChannelStatus;
  };
  workerRunning?: boolean;
  warning: string | null;
}

const CHANNEL_SETUP = {
  email: {
    variables: [
      { name: 'NOTIFICATION_SMTP_HOST', note: 'Servidor de correo' },
      { name: 'NOTIFICATION_SMTP_PORT', note: '587 por defecto; 465 también funciona' },
      { name: 'NOTIFICATION_FROM_EMAIL', note: 'Dirección remitente' },
      { name: 'NOTIFICATION_SMTP_USERNAME', note: 'Usuario SMTP, si el servidor lo requiere' },
      { name: 'NOTIFICATION_SMTP_PASSWORD', note: 'Contraseña SMTP; debe ir junto al usuario' },
    ],
  },
  sms: {
    variables: [
      { name: 'NOTIFICATION_SMS_TWILIO_ACCOUNT_SID', note: 'Identificador de la cuenta' },
      { name: 'NOTIFICATION_SMS_TWILIO_AUTH_TOKEN', note: 'Token privado de Twilio' },
      { name: 'NOTIFICATION_SMS_TWILIO_FROM_PHONE', note: 'Número remitente en formato internacional' },
    ],
  },
} as const;

export function isCustomerNotificationOperationsStatus(
  value: unknown
): value is CustomerNotificationOperationsStatus {
  if (typeof value !== 'object' || value === null || !('channels' in value)) return false;
  const candidate = value as Partial<CustomerNotificationOperationsStatus>;
  const isChannel = (channel: unknown): channel is CustomerNotificationChannelStatus => {
    if (typeof channel !== 'object' || channel === null || !('configured' in channel)) return false;
    const counts = channel as Partial<CustomerNotificationChannelStatus>;
    return (
      typeof counts.configured === 'boolean' &&
      ['pending', 'retrying', 'processing', 'failed'].every((key) => {
        const count = counts[key as keyof CustomerNotificationChannelStatus];
        return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
      })
    );
  };

  const channels = candidate.channels;
  return (
    typeof channels === 'object' &&
    channels !== null &&
    isChannel(channels.email) &&
    isChannel(channels.sms) &&
    (candidate.workerRunning === undefined || typeof candidate.workerRunning === 'boolean') &&
    (candidate.warning === null || typeof candidate.warning === 'string')
  );
}

export default function CustomerNotificationReadiness({
  status,
  unavailable,
}: {
  status: CustomerNotificationOperationsStatus | null;
  unavailable: boolean;
}) {
  const channels = status?.channels;
  const configuredCount = [channels?.email, channels?.sms].filter(
    (channel) => channel?.configured
  ).length;
  const workerRunning = status?.workerRunning === true;
  const automaticRetriesReady = configuredCount > 0 && workerRunning;
  const failedCount = (channels?.email?.failed ?? 0) + (channels?.sms?.failed ?? 0);
