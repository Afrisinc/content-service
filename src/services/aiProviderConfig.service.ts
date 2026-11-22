import type { AiProviderConfig } from '@prisma/client';
import { createError } from '@/middlewares/errorHandler';
import {
  aiProviderConfigRepository,
  type AiProviderConfigRepository,
} from '@/repositories/aiProviderConfig.repository';
import type {
  AiProviderConfigDTO,
  AiProviderKey,
  AiPurposeKey,
  ResolvedAiProviderConfig,
  SaveAiProviderConfigPayload,
} from '@/types/aiProviderConfig.types';
import { decrypt, encrypt } from '@/utils/crypto';
import { logger } from '@/utils/logger';

const CACHE_TTL_MS = 60_000;
const MIN_MASKABLE_KEY_LENGTH = 12;

interface CacheEntry {
  value: ResolvedAiProviderConfig | null;
  expiresAt: number;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length < MIN_MASKABLE_KEY_LENGTH) {
    return '••••';
  }
  return `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`;
}

export function toAiProviderConfigDTO(row: AiProviderConfig): AiProviderConfigDTO {
  return {
    id: row.id,
    provider: row.provider as AiProviderKey,
    purpose: row.purpose as AiPurposeKey,
    model: row.model,
    baseUrl: row.baseUrl,
    organizationId: row.organizationId,
    projectId: row.projectId,
    apiKeyHint: row.apiKeyHint,
    isActive: row.isActive,
    lastRotatedAt: row.lastRotatedAt.toISOString(),
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function keyFields(apiKey: string) {
  return {
    apiKeyEnc: encrypt(apiKey),
    apiKeyHint: maskApiKey(apiKey),
    lastRotatedAt: new Date(),
  };
}

export class AiProviderConfigService {
  private cache = new Map<string, CacheEntry>();

  constructor(private repository: AiProviderConfigRepository = aiProviderConfigRepository) {}

  async list(): Promise<AiProviderConfigDTO[]> {
    const rows = await this.repository.findAll();
    return rows.map(toAiProviderConfigDTO);
  }

  async save(
    provider: AiProviderKey,
    purpose: AiPurposeKey,
    payload: SaveAiProviderConfigPayload,
    updatedBy: string
  ): Promise<AiProviderConfigDTO> {
    const existing = await this.repository.findByProviderAndPurpose(provider, purpose);
    const apiKey = payload.apiKey?.trim();

    const fields = {
      model: payload.model,
      baseUrl: payload.baseUrl,
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      isActive: payload.isActive,
      updatedBy,
    };

    let row: AiProviderConfig;
    if (existing) {
      row = await this.repository.update(provider, purpose, {
        ...fields,
        ...(apiKey ? keyFields(apiKey) : {}),
      });
    } else {
      if (!apiKey) {
        throw createError.badRequest('apiKey is required when creating an AI provider config');
      }
      row = await this.repository.create(provider, purpose, { ...fields, ...keyFields(apiKey) });
    }

    this.cache.delete(this.cacheKey(provider, purpose));

    logger.info(
      { provider, purpose, updatedBy, rotated: Boolean(apiKey) },
      'AI provider config saved'
    );

    return toAiProviderConfigDTO(row);
  }

  async resolve(
    provider: AiProviderKey,
    purpose: AiPurposeKey
  ): Promise<ResolvedAiProviderConfig | null> {
    const key = this.cacheKey(provider, purpose);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const value = await this.load(provider, purpose);
      this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    } catch (error) {
      logger.warn(
        { provider, purpose, error: error instanceof Error ? error.message : 'Unknown error' },
        'AI provider config unavailable, falling back to environment'
      );
      return null;
    }
  }

  private async load(
    provider: AiProviderKey,
    purpose: AiPurposeKey
  ): Promise<ResolvedAiProviderConfig | null> {
    const row = await this.repository.findByProviderAndPurpose(provider, purpose);
    if (!row?.isActive) {
      return null;
    }

    return {
      apiKey: decrypt(row.apiKeyEnc),
      baseUrl: row.baseUrl ?? undefined,
      organizationId: row.organizationId ?? undefined,
      projectId: row.projectId ?? undefined,
      model: row.model ?? undefined,
    };
  }

  private cacheKey(provider: AiProviderKey, purpose: AiPurposeKey): string {
    return `${provider}:${purpose}`;
  }
}

export const aiProviderConfigService = new AiProviderConfigService();
