export type MetaFailureKind =
  'token' | 'permission' | 'missing' | 'rate_limit' | 'unavailable' | 'other';

export interface MetaReadError {
  status: number | null;
  code: number | null;
  subcode: number | null;
  message: string;
}

export type MetaFailureTally = Partial<Record<MetaFailureKind, number>>;

export const META_FAILURE_KINDS: readonly MetaFailureKind[] = [
  'token',
  'permission',
  'missing',
  'rate_limit',
  'unavailable',
  'other',
];

export const META_FAILURE_COPY: Record<MetaFailureKind, { label: string; action?: string }> = {
  token: { label: 'Page token expired or revoked', action: 'reconnect the page on Brands' },
  permission: {
    label: 'Meta permission missing',
    action: 'reconnect the page on Brands and allow insights',
  },
  missing: { label: 'Post no longer on the platform' },
  rate_limit: { label: 'Meta rate limit reached', action: 'retrying next hour' },
  unavailable: { label: 'Meta did not respond' },
  other: { label: 'Meta refused the request' },
};

const TOKEN_CODES = new Set([102, 190]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);
const PERMISSION_CODES = new Set([10]);
const UNAVAILABLE_CODES = new Set([1, 2]);
const MISSING_SUBCODES = new Set([33]);
const MISSING_CODES = new Set([803]);
const MIN_PERMISSION_CODE = 200;
const MAX_PERMISSION_CODE = 299;
const MIN_BUSINESS_RATE_LIMIT_CODE = 80000;
const MAX_BUSINESS_RATE_LIMIT_CODE = 80014;

export function classifyMetaError(error: MetaReadError): MetaFailureKind {
  const { status, code, subcode } = error;

  if (status === 401 || (code !== null && TOKEN_CODES.has(code))) {
    return 'token';
  }
  if (
    status === 429 ||
    (code !== null &&
      (RATE_LIMIT_CODES.has(code) ||
        (code >= MIN_BUSINESS_RATE_LIMIT_CODE && code <= MAX_BUSINESS_RATE_LIMIT_CODE)))
  ) {
    return 'rate_limit';
  }
  if (
    code !== null &&
    (PERMISSION_CODES.has(code) || (code >= MIN_PERMISSION_CODE && code <= MAX_PERMISSION_CODE))
  ) {
    return 'permission';
  }
  if (
    (code !== null && MISSING_CODES.has(code)) ||
    (subcode !== null && MISSING_SUBCODES.has(subcode))
  ) {
    return 'missing';
  }
  if (status === null || status >= 500 || (code !== null && UNAVAILABLE_CODES.has(code))) {
    return 'unavailable';
  }
  return 'other';
}

export function isFieldLevelFailure(kind: MetaFailureKind): boolean {
  return kind === 'permission' || kind === 'other';
}

export function tallyFailure(tally: MetaFailureTally, kind: MetaFailureKind): void {
  tally[kind] = (tally[kind] ?? 0) + 1;
}
