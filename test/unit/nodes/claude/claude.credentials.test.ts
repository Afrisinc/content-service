import { describe, expect, it } from 'vitest';
import { claudeCredentialsFromEnv } from '@/nodes/claude/claude.credentials';

describe('claudeCredentialsFromEnv', () => {
  it('reads the prefixed variables', () => {
    expect(
      claudeCredentialsFromEnv({
        ANTHROPIC_API_KEY: 'sk-ant-1',
        ANTHROPIC_BASE_URL: 'https://gateway',
      })
    ).toEqual({ apiKey: 'sk-ant-1', baseUrl: 'https://gateway' });
  });

  it('leaves an unset base URL undefined so the SDK default applies', () => {
    expect(claudeCredentialsFromEnv({ ANTHROPIC_API_KEY: 'sk-ant-1' })).toEqual({
      apiKey: 'sk-ant-1',
      baseUrl: undefined,
    });
  });

  it('supports a custom prefix for a second deployment', () => {
    expect(claudeCredentialsFromEnv({ VERTEX_API_KEY: 'sk-2' }, 'VERTEX')).toMatchObject({
      apiKey: 'sk-2',
    });
  });

  it('fails when the key is missing rather than calling the API without one', () => {
    expect(() => claudeCredentialsFromEnv({})).toThrow('ANTHROPIC_API_KEY is not set');
  });
});
