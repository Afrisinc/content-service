import { getNotifySdk } from '@/adapters/notify/notifySdk';
import { cacheGet, cacheSet } from '@/utils/cache';
import { logger } from '@/utils/logger';
import {
  NotifyAuthenticationError,
  NotifyError,
  NotifyNetworkError,
  NotifyRateLimitError,
  NotifyValidationError,
  type Channel,
  type Priority,
  type SendParams,
  type SendResponse,
} from '@afrisinc/notify-sdk';

const BULK_LIMIT = 1000;
const DEFAULT_DEDUPE_TTL_SECONDS = 86400;

const CHANNELS: readonly Channel[] = ['email', 'sms', 'in_app', 'push', 'whatsapp'];

export interface NotificationTarget {
  to: string;
  channel: Channel;
}

export interface NotificationRequest {
  targets: NotificationTarget[];
  template?: string;
  data?: Record<string, unknown>;
  priority?: Priority;
  dedupeKey?: string;
  dedupeTtlSeconds?: number;
}

export type NotificationSkipReason = 'not-configured' | 'no-targets' | 'duplicate';

export interface NotificationResult {
  sent: SendResponse[];
  failed: number;
  skipped: NotificationSkipReason | null;
}

export interface BulkNotificationResult {
  accepted: number;
  rejected: number;
  skipped: NotificationSkipReason | null;
}

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

export function parseChannels(values: readonly string[]): Channel[] {
  const known = values.filter(isChannel);

  if (known.length !== values.length) {
    logger.warn(
      { configured: values, unknown: values.filter(value => !isChannel(value)) },
      'Ignoring unknown notification channels'
    );
  }

  return known;
}

export function describeNotifyFailure(error: unknown): string {
  if (error instanceof NotifyAuthenticationError) {
    return 'authentication-failed';
  }
  if (error instanceof NotifyValidationError) {
    return `validation-failed: ${error.message}`;
  }
  if (error instanceof NotifyRateLimitError) {
    const retry = error.retryAfter ? `: retry after ${error.retryAfter}s` : '';
    return `rate-limited${retry}`;
  }
  if (error instanceof NotifyNetworkError) {
    return 'network-error';
  }
  if (error instanceof NotifyError) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : 'unknown-error';
}

export async function sendNotification(request: NotificationRequest): Promise<NotificationResult> {
  const sdk = getNotifySdk();

  if (!sdk) {
    logger.debug({ template: request.template }, 'Notify is not configured, notification skipped');
    return { sent: [], failed: 0, skipped: 'not-configured' };
  }

  if (!request.targets.length) {
    logger.debug({ template: request.template }, 'Notification has no reachable target');
    return { sent: [], failed: 0, skipped: 'no-targets' };
  }

  if (request.dedupeKey && (await cacheGet<number>(request.dedupeKey))) {
    logger.debug({ template: request.template }, 'Notification already sent, skipping the repeat');
    return { sent: [], failed: 0, skipped: 'duplicate' };
  }

  const results = await Promise.allSettled(
    request.targets.map(target =>
      sdk.send({
        to: target.to,
        channel: target.channel,
        template: request.template,
        data: request.data,
        priority: request.priority,
      })
    )
  );

  const sent: SendResponse[] = [];
  let failed = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sent.push(result.value);
      return;
    }

    failed += 1;
    logger.warn(
      {
        channel: request.targets[index].channel,
        template: request.template,
        reason: describeNotifyFailure(result.reason),
      },
      'Notification delivery failed'
    );
  });

  if (request.dedupeKey && sent.length) {
    await cacheSet(
      request.dedupeKey,
      Date.now(),
      request.dedupeTtlSeconds ?? DEFAULT_DEDUPE_TTL_SECONDS
    );
  }

  return { sent, failed, skipped: null };
}

export async function sendBulkNotifications(
  notifications: readonly SendParams[]
): Promise<BulkNotificationResult> {
  const sdk = getNotifySdk();

  if (!sdk) {
    logger.debug({ count: notifications.length }, 'Notify is not configured, bulk send skipped');
    return { accepted: 0, rejected: 0, skipped: 'not-configured' };
  }

  if (!notifications.length) {
    return { accepted: 0, rejected: 0, skipped: 'no-targets' };
  }

  let accepted = 0;
  let rejected = 0;

  for (let index = 0; index < notifications.length; index += BULK_LIMIT) {
    const chunk = notifications.slice(index, index + BULK_LIMIT);

    try {
      const result = await sdk.bulk({ notifications: [...chunk] });
      accepted += result.accepted;
      rejected += result.rejected;
    } catch (error) {
      rejected += chunk.length;
      logger.warn(
        { size: chunk.length, reason: describeNotifyFailure(error) },
        'Bulk notification chunk failed'
      );
    }
  }

  return { accepted, rejected, skipped: null };
}
