import { Notify } from '@afrisinc/notify-sdk';
import { env } from '@/config/env';

let sdk: Notify | null = null;

export function isNotifyConfigured(): boolean {
  return Boolean(env.NOTIFY_API_KEY);
}

export function getNotifySdk(): Notify | null {
  if (!isNotifyConfigured()) {
    return null;
  }

  if (!sdk) {
    sdk = new Notify({
      apiKey: env.NOTIFY_API_KEY,
      ...(env.NOTIFY_API_URL ? { baseUrl: env.NOTIFY_API_URL } : {}),
      timeout: env.NOTIFY_TIMEOUT_MS,
      retries: env.NOTIFY_RETRIES,
    });
  }

  return sdk;
}

export function resetNotifySdk(): void {
  sdk = null;
}
