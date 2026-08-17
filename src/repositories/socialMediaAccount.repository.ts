/**
 * Social Media Account Repository
 * Database operations for connected accounts under a platform integration
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '@/database/prismaClient';
import type { SocialPlatformKey } from '@/types/socialMediaIntegration.types';

export class SocialMediaAccountRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findAllByUser(userId: string) {
    return this.prisma.socialMediaAccount.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(accountId: string) {
    return this.prisma.socialMediaAccount.findUnique({
      where: { id: accountId },
    });
  }

  async findByOAuthState(oauthState: string) {
    return this.prisma.socialMediaAccount.findFirst({
      where: { oauthState, isActive: true },
    });
  }

  async create(data: {
    userId: string;
    platform: SocialPlatformKey;
    pageId: string;
    pageName: string;
    meta?: string | null;
    scopes: string[];
    oauthState?: string;
    accessToken?: string;
    longLivedToken?: string;
    longLivedExpiresAt?: Date;
    tokenType?: 'SHORT_LIVED' | 'LONG_LIVED';
  }) {
    return this.prisma.socialMediaAccount.create({ data });
  }

  async updateTokens(
    accountId: string,
    tokens: {
      accessToken?: string;
      shortLivedToken?: string;
      shortLivedExpiresAt?: Date;
      longLivedToken?: string;
      longLivedExpiresAt?: Date;
      refreshToken?: string;
      tokenType?: 'SHORT_LIVED' | 'LONG_LIVED';
      tokenExpiresAt?: Date;
    }
  ) {
    return this.prisma.socialMediaAccount.update({
      where: { id: accountId },
      data: {
        ...tokens,
        oauthState: null,
      },
    });
  }

  async setOAuthState(accountId: string, state: string) {
    return this.prisma.socialMediaAccount.update({
      where: { id: accountId },
      data: { oauthState: state },
    });
  }

  async delete(accountId: string) {
    return this.prisma.socialMediaAccount.delete({
      where: { id: accountId },
    });
  }
}

export const socialMediaAccountRepository = new SocialMediaAccountRepository();
