import { describe, expect, it } from 'vitest';
import { chatGptCredentialsFromEnv } from '@/nodes/chatgpt/chatgpt.credentials';

describe('chatGptCredentialsFromEnv', () => {
  it('reads the prefixed variables and leaves the optional ones undefined', () => {
    expect(chatGptCredentialsFromEnv({ OPENAI_API_KEY: 'sk-1', OPENAI_ORG_ID: 'org-1' })).toEqual({
      apiKey: 'sk-1',
      baseUrl: undefined,
      organizationId: 'org-1',
      projectId: undefined,
    });
  });

  it('supports a custom prefix for a second deployment', () => {
    const credentials = chatGptCredentialsFromEnv(
      { AZURE_API_KEY: 'sk-2', AZURE_BASE_URL: 'https://azure/v1', AZURE_PROJECT_ID: 'p-1' },
      'AZURE'
    );

    expect(credentials).toMatchObject({
      apiKey: 'sk-2',
      baseUrl: 'https://azure/v1',
      projectId: 'p-1',
    });
  });

  it('fails when the key is missing rather than calling the API without one', () => {
    expect(() => chatGptCredentialsFromEnv({})).toThrow('OPENAI_API_KEY is not set');
  });
});
