import { PrismaClient } from '@prisma/client';
import { prisma } from '@/database/prismaClient';
import type { AiProviderKey, AiPurposeKey } from '@/types/aiProviderConfig.types';

export interface AiProviderConfigWrite {
  apiKeyEnc?: string;
  apiKeyHint?: string;
  lastRotatedAt?: Date;
  model?: string | null;
  baseUrl?: string | null;
  organizationId?: string | null;
  projectId?: string | null;
  isActive?: boolean;
  updatedBy?: string | null;
}

export class AiProviderConfigRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findAll() {
    return this.prisma.aiProviderConfig.findMany({
      orderBy: [{ provider: 'asc' }, { purpose: 'asc' }],
      take: 100,
    });
  }

  async findByProviderAndPurpose(provider: AiProviderKey, purpose: AiPurposeKey) {
    return this.prisma.aiProviderConfig.findUnique({
      where: { provider_purpose: { provider, purpose } },
    });
  }

  async create(
    provider: AiProviderKey,
    purpose: AiPurposeKey,
    data: AiProviderConfigWrite & { apiKeyEnc: string; apiKeyHint: string }
  ) {
    return this.prisma.aiProviderConfig.create({ data: { provider, purpose, ...data } });
  }

  async update(provider: AiProviderKey, purpose: AiPurposeKey, data: AiProviderConfigWrite) {
    return this.prisma.aiProviderConfig.update({
      where: { provider_purpose: { provider, purpose } },
      data,
    });
  }
}

export const aiProviderConfigRepository = new AiProviderConfigRepository();
