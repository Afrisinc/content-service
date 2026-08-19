import { NodeOperationError, type INodeCredentialDescription } from '../core';
import { CLAUDE_CREDENTIALS_NAME } from './claude.constants';
import type { ClaudeCredentials } from './claude.types';

export const claudeCredentialDescription: INodeCredentialDescription = {
  name: CLAUDE_CREDENTIALS_NAME,
  displayName: 'Claude (Anthropic) API',
  documentationUrl: 'https://platform.claude.com/docs/en/api',
  properties: [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      default: '',
      required: true,
      typeOptions: { password: true },
      description: 'Key from the Anthropic Console',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: '',
      description: 'Override for a gateway or proxy in front of the Anthropic API',
    },
  ],
};

type EnvSource = Record<string, string | undefined>;

export function claudeCredentialsFromEnv(
  env: EnvSource = process.env,
  prefix = 'ANTHROPIC'
): ClaudeCredentials {
  const apiKey = env[`${prefix}_API_KEY`];

  if (!apiKey) {
    throw new NodeOperationError(`${prefix}_API_KEY is not set`);
  }

  return { apiKey, baseUrl: env[`${prefix}_BASE_URL`] || undefined };
}
