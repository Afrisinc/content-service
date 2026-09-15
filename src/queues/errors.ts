export type ErrorClass = 'transient' | 'permanent' | 'unknown';

export class PermanentJobError extends Error {
  readonly errorClass: ErrorClass = 'permanent';

  constructor(
    message: string,
    readonly code = 'PERMANENT'
  ) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export class TransientJobError extends Error {
  readonly errorClass: ErrorClass = 'transient';

  constructor(
    message: string,
    readonly code = 'TRANSIENT'
  ) {
    super(message);
    this.name = 'TransientJobError';
  }
}

const TRANSIENT_PATTERNS = [
  /ECONNRESET/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /timeout/i,
  /rate.?limit/i,
  /429/,
  /50[234]/,
  /temporarily unavailable/i,
];

const PERMANENT_PATTERNS = [
  /validation/i,
  /schema/i,
  /invalid/i,
  /not found/i,
  /unauthori[sz]ed/i,
  /forbidden/i,
  /40[13]/,
  /unsupported/i,
  /moderation/i,
];

export function classifyError(err: unknown): ErrorClass {
  if (err instanceof PermanentJobError) {
    return 'permanent';
  }
  if (err instanceof TransientJobError) {
    return 'transient';
  }
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (PERMANENT_PATTERNS.some(pattern => pattern.test(message))) {
    return 'permanent';
  }
  if (TRANSIENT_PATTERNS.some(pattern => pattern.test(message))) {
    return 'transient';
  }
  return 'unknown';
}

export function isRetryable(err: unknown): boolean {
  return classifyError(err) !== 'permanent';
}

export function errorCodeOf(err: unknown): string {
  if (err instanceof PermanentJobError || err instanceof TransientJobError) {
    return err.code;
  }
  if (err instanceof Error) {
    return err.name;
  }
  return 'UNKNOWN';
}
