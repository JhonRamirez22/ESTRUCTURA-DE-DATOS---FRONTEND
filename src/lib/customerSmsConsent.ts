export interface CustomerSmsConsent {
  customerPhone: string | null;
  smsNotificationsEnabled: boolean;
}

const COLOMBIAN_MOBILE_PATTERN = /^(?:\+?57)?3\d{9}$/;

export function buildCustomerSmsConsent(
  phone: string,
  notificationsEnabled: boolean,
): CustomerSmsConsent | null {
  if (!notificationsEnabled) {
