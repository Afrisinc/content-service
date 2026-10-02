import {
  chatGptCredentialsFromEnv,
  claudeCredentialsFromEnv,
  type ChatGptCredentials,
  type ClaudeCredentials,
} from '@/nodes';
import { aiProviderConfigService } from '@/services/aiProviderConfig.service';
import type {
  AiProviderKey,
  AiPurposeKey,
  ResolvedAiProviderConfig,
} from '@/types/aiProviderConfig.types';

export interface ResolvedClaudeConfig {
  credentials: ClaudeCredentials;
  model?: string;
}

export interface ResolvedChatGptConfig {
  credentials: ChatGptCredentials;
  model?: string;
}

async function findStoredConfig(
  provider: AiProviderKey,
  purpose: AiPurposeKey
): Promise<ResolvedAiProviderConfig | null> {
  const stored = await aiProviderConfigService.resolve(provider, purpose);
  if (stored || purpose === 'text') {
    return stored;
  }
  const shared = await aiProviderConfigService.resolve(provider, 'text');
  return shared ? { ...shared, model: undefined } : null;
}

export async function resolveClaudeConfig(
  purpose: AiPurposeKey = 'text'
): Promise<ResolvedClaudeConfig> {
  const stored = await findStoredConfig('anthropic', purpose);
  if (!stored) {
    return { credentials: claudeCredentialsFromEnv() };
  }

  return {
    credentials: { apiKey: stored.apiKey, baseUrl: stored.baseUrl },
    model: stored.model,
  };
}

export async function resolveChatGptConfig(
  purpose: AiPurposeKey = 'text'
): Promise<ResolvedChatGptConfig> {
  const stored = await findStoredConfig('openai', purpose);
  if (!stored) {
    return { credentials: chatGptCredentialsFromEnv() };
  }

  return {
    credentials: {
      apiKey: stored.apiKey,
      baseUrl: stored.baseUrl,
      organizationId: stored.organizationId,
      projectId: stored.projectId,
    },
    model: stored.model,
  };
}
