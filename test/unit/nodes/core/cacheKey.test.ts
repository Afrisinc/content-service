import { describe, expect, it } from 'vitest';
import { buildCacheKey, credentialFingerprint } from '@/nodes/core/cache.key';

const base = {
  node: 'claude',
  version: 1,
  parameters: { resource: 'text', operation: 'message', prompt: 'hi' },
  credentials: { claudeApi: { apiKey: 'sk-ant-secret' } },
};

describe('buildCacheKey', () => {
  it('ignores the order the parameters were written in', () => {
    const reordered = {
      ...base,
      parameters: { prompt: 'hi', operation: 'message', resource: 'text' },
    };

    expect(buildCacheKey(reordered)).toBe(buildCacheKey(base));
  });

  it('changes when any parameter changes', () => {
    const different = { ...base, parameters: { ...base.parameters, prompt: 'hello' } };

    expect(buildCacheKey(different)).not.toBe(buildCacheKey(base));
  });

  it('separates two accounts using the same prompt', () => {
    const other = { ...base, credentials: { claudeApi: { apiKey: 'sk-ant-other' } } };

    expect(buildCacheKey(other)).not.toBe(buildCacheKey(base));
  });

  it('separates node versions', () => {
    expect(buildCacheKey({ ...base, version: 2 })).not.toBe(buildCacheKey(base));
  });

  it('never puts the API key in the key', () => {
    expect(buildCacheKey(base)).not.toContain('sk-ant-secret');
    expect(buildCacheKey(base)).toMatch(/^ainode:cache:claude:v1:[a-f0-9]{64}$/);
  });

  it('treats a missing value and an undefined value as the same request', () => {
    const withUndefined = { ...base, parameters: { ...base.parameters, extra: undefined } };

    expect(buildCacheKey(withUndefined)).toBe(buildCacheKey(base));
  });
});

describe('credentialFingerprint', () => {
  it('is stable and does not leak the secret', () => {
    const fingerprint = credentialFingerprint({ apiKey: 'sk-ant-secret' });

    expect(fingerprint).toBe(credentialFingerprint({ apiKey: 'sk-ant-secret' }));
    expect(fingerprint).not.toContain('sk-ant-secret');
    expect(fingerprint).toHaveLength(12);
  });
});
