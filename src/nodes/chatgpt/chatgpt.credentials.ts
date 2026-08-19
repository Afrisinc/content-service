import { NodeOperationError, type INodeCredentialDescription } from '../core';
import { CHATGPT_CREDENTIALS_NAME, DEFAULT_BASE_URL } from './chatgpt.constants';
import type { ChatGptCredentials } from './chatgpt.types';

export const chatGptCredentialDescription: INodeCredentialDescription = {
  name: CHATGPT_CREDENTIALS_NAME,
  displayName: 'ChatGPT (OpenAI) API',
  documentationUrl: 'https://platform.openai.com/docs/api-reference',
  properties: [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      default: '',
      required: true,
      typeOptions: { password: true },
      description: 'Secret key from the OpenAI dashboard',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: DEFAULT_BASE_URL,
      description: 'Override for Azure OpenAI, a gateway, or a compatible provider',
    },
    {
      displayName: 'Organization ID',
      name: 'organizationId',
      type: 'string',
      default: '',
    },
    {
      displayName: 'Project ID',
      name: 'projectId',
      type: 'string',
      default: '',
    },
  ],
};

type EnvSource = Record<string, string | undefined>;

/**
 * Builds credentials from environment variables so a host app can wire the node up
 * without carrying its own config layer. Prefer passing credentials in explicitly.
 */
export function chatGptCredentialsFromEnv(
  env: EnvSource = process.env,
  prefix = 'OPENAI'
): ChatGptCredentials {
  const apiKey = env[`${prefix}_API_KEY`];

  if (!apiKey) {
    throw new NodeOperationError(`${prefix}_API_KEY is not set`);
  }

  return {
    apiKey,
    baseUrl: env[`${prefix}_BASE_URL`] || undefined,
    organizationId: env[`${prefix}_ORG_ID`] || undefined,
    projectId: env[`${prefix}_PROJECT_ID`] || undefined,
  };
}
