import { createHash } from 'node:crypto';

/** Key ordering must be stable, or an identical request silently misses the cache. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);

  return `{${entries.join(',')}}`;
}

/** A fingerprint, never the key itself — cache keys end up in logs and dashboards. */
export function credentialFingerprint(credentials: unknown): string {
  return createHash('sha256').update(stableStringify(credentials)).digest('hex').slice(0, 12);
}

export function buildCacheKey(input: {
  node: string;
  version: number;
  parameters: unknown;
  credentials?: unknown;
}): string {
  const digest = createHash('sha256')
    .update(
      stableStringify({
        parameters: input.parameters,
        credentials: credentialFingerprint(input.credentials),
      })
    )
    .digest('hex');

  return `ainode:cache:${input.node}:v${input.version}:${digest}`;
}
