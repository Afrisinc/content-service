/**
 * Social Media Integration Repository
 * Database operations for per-platform app credentials
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '@/database/prismaClient';
import type { SocialPlatformKey } from '@/types/socialMediaIntegration.types';

export class SocialMediaIntegrationRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findAllByUser(userId: string) {
    return this.prisma.socialMediaIntegration.findMany({
      where: { userId },
    });
  }

  async findByUserAndPlatform(userId: string, platform: SocialPlatformKey) {
    return this.prisma.socialMediaIntegration.findUnique({
      where: { userId_platform: { userId, platform } },
    });
  }

  async upsertCredentials(
    userId: string,
    platform: SocialPlatformKey,
    appId: string,
    appSecretEnc: string,
    callbackUrl?: string
  ) {
    return this.prisma.socialMediaIntegration.upsert({
      where: { userId_platform: { userId, platform } },
      update: {
        appId,
        appSecretEnc,
        ...(callbackUrl ? { callbackUrl } : {}),
        updatedAt: new Date(),
      },
      create: { userId, platform, appId, appSecretEnc, ...(callbackUrl ? { callbackUrl } : {}) },
    });
  }

  async updateCredentials(
    userId: string,
    platform: SocialPlatformKey,
    data: { appId: string; appSecretEnc?: string; callbackUrl?: string }
  ) {
    return this.prisma.socialMediaIntegration.update({
      where: { userId_platform: { userId, platform } },
      data: { ...data, updatedAt: new Date() },
    });
  }

  async touchSynced(userId: string, platform: SocialPlatformKey) {
    return this.prisma.socialMediaIntegration.update({
      where: { userId_platform: { userId, platform } },
      data: { syncedAt: new Date() },
    });
  }
}

export const socialMediaIntegrationRepository = new SocialMediaIntegrationRepository();
