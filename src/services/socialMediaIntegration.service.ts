/**
 * Social Media Integration Service
 * Business logic for platform connections and their accounts
 */

import { randomUUID } from 'node:crypto';
import { createError } from '@/middlewares/errorHandler';
import { encrypt, decrypt } from '@/utils/crypto';
import {
  exchangeAuthCodeForToken,
  exchangeShortForLongLived,
  encryptToken,
  calculateExpiresAt,
  fetchFacebookPages,
  type FacebookPage,
} from '@/utils/oauthToken';
import { logger } from '@/utils/logger';
import { recordOAuthTokenExchange } from '@/middlewares/oauthRateLimit';
import { socialMediaIntegrationRepository } from '@/repositories/socialMediaIntegration.repository';
import { socialMediaAccountRepository } from '@/repositories/socialMediaAccount.repository';
import {
  SOCIAL_PLATFORMS,
  SocialPlatformKey,
  SocialMediaIntegrationDTO,
} from '@/types/socialMediaIntegration.types';

export class SocialMediaIntegrationService {
  async listIntegrations(userId: string): Promise<SocialMediaIntegrationDTO[]> {
    const [integrations, accounts] = await Promise.all([
      socialMediaIntegrationRepository.findAllByUser(userId),
      socialMediaAccountRepository.findAllByUser(userId),
    ]);

    return SOCIAL_PLATFORMS.map(platform => {
      const integration = integrations.find(row => row.platform === platform);
      const platformAccounts = accounts
        .filter(row => row.platform === platform)
        .map(row => ({
          id: row.id,
          name: row.pageName ?? row.pageId,
          meta: row.meta,
          scopes: row.scopes,
          createdAt: row.createdAt.toISOString(),
        }));

      return {
        platform,
        appId: integration?.appId ?? null,
        connected: platformAccounts.length > 0,
        syncedAt: integration?.syncedAt?.toISOString() ?? null,
        accounts: platformAccounts,
      };
    });
  }

  async saveCredentials(
    userId: string,
    platform: SocialPlatformKey,
    appId: string,
    appSecret: string,
    callbackUrl?: string
  ) {
    const appSecretEnc = encrypt(appSecret);
    const integration = await socialMediaIntegrationRepository.upsertCredentials(
      userId,
      platform,
      appId,
      appSecretEnc,
      callbackUrl
    );

    return {
      platform,
      appId: integration.appId,
      callbackUrl: integration.callbackUrl ?? null,
      updatedAt: integration.updatedAt.toISOString(),
    };
  }

  async updateCredentials(
    userId: string,
    platform: SocialPlatformKey,
    appId: string,
    appSecret?: string,
    callbackUrl?: string
  ) {
    const integration = await socialMediaIntegrationRepository.updateCredentials(userId, platform, {
      appId,
      ...(appSecret ? { appSecretEnc: encrypt(appSecret) } : {}),
      ...(callbackUrl ? { callbackUrl } : {}),
    });

    return {
      platform,
      appId: integration.appId,
      callbackUrl: integration.callbackUrl ?? null,
      updatedAt: integration.updatedAt.toISOString(),
    };
  }

  async addAccount(
    userId: string,
    platform: SocialPlatformKey,
    data: {
      name: string;
      meta?: string;
      scopes: string[];
      accessToken?: string;
      expiresIn?: number;
    }
  ) {
    const integration = await socialMediaIntegrationRepository.findByUserAndPlatform(
      userId,
      platform
    );
    if (!integration) {
      logger.warn({ userId, platform }, 'Missing credentials for account creation');
      throw createError.badRequest(`Save ${platform} app credentials before adding an account`);
    }

    logger.info(
      { userId, platform, name: data.name, scopes: data.scopes },
      'Creating account with credentials'
    );

    const oauthStateToken = randomUUID();

    const baseData = {
      userId,
      platform,
      pageId: randomUUID(),
      pageName: data.name,
      meta: data.meta ?? null,
      scopes: data.scopes,
      oauthState: oauthStateToken, // Store state for OAuth callback validation
    };

    const createData = data.accessToken
      ? {
          ...baseData,
          accessToken: encryptToken(data.accessToken),
          longLivedToken: encryptToken(data.accessToken),
          longLivedExpiresAt: data.expiresIn ? calculateExpiresAt(data.expiresIn) : undefined,
          tokenType: 'LONG_LIVED' as const,
        }
      : baseData;

    const account = await socialMediaAccountRepository.create(createData);

    await socialMediaIntegrationRepository.touchSynced(userId, platform);

    const response = {
      id: account.id,
      oauthState: oauthStateToken, // Use the stored state token for CSRF protection
      name: account.pageName ?? account.pageId,
      meta: account.meta,
      scopes: account.scopes,
      createdAt: account.createdAt.toISOString(),
    };

    logger.info({ response }, 'Service returning account with oauthState');
    console.log('[SERVICE] addAccount returning:', response);

    return response;
  }

  async getAvailablePages(
    userId: string,
    platform: SocialPlatformKey
  ): Promise<{
    available: FacebookPage[];
    connected: FacebookPage[];
  }> {
    const integration = await socialMediaIntegrationRepository.findByUserAndPlatform(
      userId,
      platform
    );
    if (!integration) {
      throw createError.badRequest(`Save ${platform} app credentials first`);
    }

    const connectedAccounts = await socialMediaAccountRepository.findAllByUser(userId);
    const platformAccounts = connectedAccounts.filter(row => row.platform === platform);

    logger.info(
      {
        userId,
        platform,
        accountCount: platformAccounts.length,
        accounts: platformAccounts.map(a => ({
          id: a.id,
          pageName: a.pageName,
          hasLongLivedToken: !!a.longLivedToken,
        })),
      },
      'Fetching available pages'
    );

    if (platformAccounts.length === 0) {
      logger.warn({ userId, platform }, 'No connected accounts found to fetch pages from');
      return { available: [], connected: [] };
    }

    const connectedPageIds = new Set(platformAccounts.map(row => row.pageId));

    let availablePages: FacebookPage[] = [];
    try {
      if (platform === 'facebook' || platform === 'instagram') {
        const account = platformAccounts.find(acc => acc.longLivedToken);

        if (!account?.longLivedToken) {
          logger.error(
            { userId, platform, totalAccounts: platformAccounts.length },
            'No connected account with valid token found'
          );
          throw createError.badRequest(
            `No connected account with valid token. Please reconnect your account.`
          );
        }

        const decryptedToken = decrypt(account.longLivedToken);
        logger.info(
          {
            userId,
            platform,
            accountId: account.id,
            pageName: account.pageName,
            tokenPreview: decryptedToken.substring(0, 20) + '...',
          },
          'Fetching pages from Facebook using account token'
        );

        availablePages = await fetchFacebookPages(decryptedToken);

        logger.info(
          { userId, platform, pageCount: availablePages.length },
          'Successfully fetched pages from Facebook'
        );
      }
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          platform,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to fetch available pages from Facebook'
      );
      throw createError.internal(
        `Failed to fetch pages: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    const connected = availablePages.filter(page => connectedPageIds.has(page.id));
    const available = availablePages.filter(page => !connectedPageIds.has(page.id));

    logger.info(
      { userId, platform, availableCount: available.length, connectedCount: connected.length },
      'Returning pages'
    );

    return { available, connected };
  }

  async addAccountFromFacebookPage(
    userId: string,
    platform: SocialPlatformKey,
    facebookPageId: string,
    page: FacebookPage,
    scopes: string[],
    accessToken: string
  ) {
    const integration = await socialMediaIntegrationRepository.findByUserAndPlatform(
      userId,
      platform
    );
    if (!integration) {
      throw createError.badRequest(`Save ${platform} app credentials before adding an account`);
    }

    const encryptedToken = encryptToken(accessToken);

    const account = await socialMediaAccountRepository.create({
      userId,
      platform,
      pageId: facebookPageId,
      pageName: page.name,
      meta: page.category || null,
      scopes,
      accessToken: encryptedToken,
      longLivedToken: encryptedToken,
      longLivedExpiresAt: calculateExpiresAt(5184000),
      tokenType: 'LONG_LIVED',
    });

    await socialMediaIntegrationRepository.touchSynced(userId, platform);

    return {
      id: account.id,
      pageId: account.pageId,
      name: account.pageName ?? account.pageId,
      scopes: account.scopes,
      createdAt: account.createdAt.toISOString(),
    };
  }

  async deleteAccount(userId: string, accountId: string): Promise<void> {
    const account = await socialMediaAccountRepository.findById(accountId);
    if (!account) {
      throw createError.notFound('Account not found');
    }

    if (account.userId !== userId) {
      throw createError.forbidden('Cannot delete account from another user');
    }

    await socialMediaAccountRepository.delete(accountId);
    logger.info({ userId, accountId, platform: account.platform }, 'Account deleted');
  }

  async handleOAuthCallback(
    platform: SocialPlatformKey,
    code: string,
    state: string,
    redirectUri: string
  ) {
    const account = await socialMediaAccountRepository.findByOAuthState(state);
    if (!account) {
      throw createError.badRequest('Invalid OAuth state token');
    }

    // Rate limit token exchange per user
    await recordOAuthTokenExchange(account.userId);

    const integration = await socialMediaIntegrationRepository.findByUserAndPlatform(
      account.userId,
      platform
    );
    if (!integration) {
      throw createError.badRequest(`No integration found for ${platform}`);
    }

    const appSecret = decrypt(integration.appSecretEnc);
    // Use stored callback URL if configured, otherwise fall back to derived URI from request
    const callbackUrl = integration.callbackUrl || redirectUri;

    const tokenResponse = await exchangeAuthCodeForToken(
      platform,
      code,
      integration.appId,
      appSecret,
      callbackUrl
    );

    const shortLivedToken = tokenResponse.access_token;
    const shortLivedExpiresAt = calculateExpiresAt(tokenResponse.expires_in);

    let longLivedToken = shortLivedToken;
    let longLivedExpiresAt = shortLivedExpiresAt;

    if (
      (platform === 'facebook' || platform === 'instagram') &&
      tokenResponse.expires_in < 5184000
    ) {
      try {
        const longLivedResponse = await exchangeShortForLongLived(
          platform,
          shortLivedToken,
          integration.appId,
          appSecret
        );
        longLivedToken = longLivedResponse.access_token;
        longLivedExpiresAt = calculateExpiresAt(longLivedResponse.expires_in);
      } catch (error) {
        logger.warn({ error }, 'Failed to exchange for long-lived token, using short-lived');
      }
    }

    const encryptedShortToken = encryptToken(shortLivedToken);
    const encryptedLongToken = encryptToken(longLivedToken);

    await socialMediaAccountRepository.updateTokens(account.id, {
      accessToken: encryptedLongToken,
      shortLivedToken: encryptedShortToken,
      shortLivedExpiresAt,
      longLivedToken: encryptedLongToken,
      longLivedExpiresAt,
      tokenType: 'LONG_LIVED',
      refreshToken: tokenResponse.refresh_token
        ? encryptToken(tokenResponse.refresh_token)
        : undefined,
    });

    let pages: FacebookPage[] = [];
    if (platform === 'facebook' || platform === 'instagram') {
      try {
        pages = await fetchFacebookPages(longLivedToken);
        logger.info({ platform, pageCount: pages.length }, 'Fetched user pages from Facebook');
      } catch (error) {
        logger.warn({ error, platform }, 'Failed to fetch user pages, returning without page list');
      }
    }

    return {
      accountId: account.id,
      platform,
      connected: true,
      expiresAt: longLivedExpiresAt.toISOString(),
      pages,
    };
  }
}
