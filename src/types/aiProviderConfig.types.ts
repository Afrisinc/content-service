export const AI_PROVIDERS = ['anthropic', 'openai'] as const;
export type AiProviderKey = (typeof AI_PROVIDERS)[number];

export const AI_PURPOSES = ['text', 'image', 'summary'] as const;
export type AiPurposeKey = (typeof AI_PURPOSES)[number];

export interface SaveAiProviderConfigPayload {
  apiKey?: string;
  model?: string | null;
  baseUrl?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  isActive?: boolean;
}

export interface AiProviderConfigDTO {
  id: string;
  provider: AiProviderKey;
  purpose: AiPurposeKey;
  model: string | null;
  baseUrl: string | null;
  organizationId: string | null;
  projectId: string | null;
  apiKeyHint: string;
  isActive: boolean;
  lastRotatedAt: string;
  updatedBy: string | null;
  updatedAt: string;
}

export interface ResolvedAiProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
  projectId?: string;
  model?: string;
}
