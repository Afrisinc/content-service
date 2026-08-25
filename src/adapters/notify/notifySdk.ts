import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import {
  Notify,
  NotifyAuthenticationError,
  NotifyError,
  NotifyNetworkError,
  NotifyRateLimitError,
  NotifyValidationError,
} from '@afrisinc/notify-sdk';

let sdk: Notify | null = null;

export function isNotifyConfigured(): boolean {
  return Boolean(env.NOTIFY_API_KEY);
}

export function getNotifySdk(): Notify | null {
  if (!isNotifyConfigured()) {
    return null;
  }

  sdk ??= new Notify({ apiKey: env.NOTIFY_API_KEY });

  return sdk;
}

export function resetNotifySdk(): void {
  sdk = null;
}

function logNotifyError(operation: string, error: unknown): void {
  if (error instanceof NotifyAuthenticationError) {
    logger.error({ operation }, '[Notify] Invalid API key');
  } else if (error instanceof NotifyValidationError) {
    logger.error({ operation, message: error.message }, '[Notify] Validation failed');
  } else if (error instanceof NotifyRateLimitError) {
    logger.error({ operation, retryAfter: error.retryAfter }, '[Notify] Rate limited');
  } else if (error instanceof NotifyNetworkError) {
    logger.error({ operation, message: error.message }, '[Notify] Network error');
  } else if (error instanceof NotifyError) {
    logger.error({ operation, code: error.code, message: error.message }, '[Notify] Error');
  } else {
    logger.error({ operation, error }, '[Notify] Unknown error');
  }
}

type NotifyMethod = (...args: unknown[]) => unknown;

// resolveParent runs lazily inside `callable`, so a misconfigured SDK rejects instead of
// throwing on property access (e.g. `notify.campaigns`).
function createNotifyNode(
  resolveParent: () => object,
  prop: PropertyKey | null,
  path: string
): unknown {
  function resolveValue(): unknown {
    const parent = resolveParent();
    return prop === null ? parent : Reflect.get(parent, prop);
  }

  const callable = async (...args: unknown[]) => {
    try {
      const parent = resolveParent();
      const value = prop === null ? parent : Reflect.get(parent, prop);

      if (typeof value !== 'function') {
        throw new TypeError(`notify.${path} is not a function`);
      }

      return await (value as NotifyMethod).apply(parent, args);
    } catch (error) {
      logNotifyError(path, error);
      throw error;
    }
  };

  return new Proxy(callable, {
    get(_target, childProp) {
      const childPath = path ? `${path}.${String(childProp)}` : String(childProp);
      return createNotifyNode(() => resolveValue() as object, childProp, childPath);
    },
  });
}

// Proxies aren't structurally typed, so the cast restores `notify`'s shape to `Notify`.
export const notify = createNotifyNode(
  () => {
    const client = getNotifySdk();

    if (!client) {
      throw new Error('Notify is not configured: set NOTIFY_API_KEY');
    }

    return client;
  },
  null,
  ''
) as Notify;
