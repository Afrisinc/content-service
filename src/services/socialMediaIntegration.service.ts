/**
 * Social Media Integration Service
 * Business logic for platform connections and their accounts
 */

import { randomUUID } from 'node:crypto';
import { SocialMediaAccount } from '@prisma/client';
import { createError } from '@/middlewares/errorHandler';
import { env } from '@/config/env';
import { encrypt, decrypt } from '@/utils/crypto';
import { cacheDelete, cacheGet, cacheSet } from '@/utils/cache';
import {
  exchangeAuthCodeForToken,
  exchangeShortForLongLived,
  encryptToken,
  calculateExpiresAt,
  fetchFacebookPages,
  fetchInstagramBusinessAccount,
  type FacebookPage,
} from '@/utils/oauthToken';
import { logger } from '@/utils/logger';
import {
  buildConnectionRecordPageId,
  isConnectionRecordPageId,
  platformUsesConnectionRecord,
} from '@/utils/oauthConnectionRecord';
import { buildConnectedPagesFromAccounts } from '@/helpers/socialMediaPage.helper';
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
      const platformRows = accounts.filter(row => row.platform === platform);
      const platformAccounts = platformRows
        .filter(row => !isConnectionRecordPageId(row.pageId))
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
        connected: platformAccounts.length > 0 || platformRows.some(row => !!row.longLivedToken),
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
      pageId: platformUsesConnectionRecord(platform) ? buildConnectionRecordPageId() : randomUUID(),
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

    logger.info({ accountId: account.id, platform }, 'Account created, awaiting OAuth callback');

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

    const availablePages = await this.resolvePlatformPages(userId, platform, platformAccounts);

    if (!availablePages) {
      const stored = buildConnectedPagesFromAccounts(platformAccounts, platform);
      logger.warn(
        { userId, platform, connectedCount: stored.length },
        'Serving stored accounts, platform pages could not be resolved'
      );
      return { available: [], connected: stored };
    }

    // An Instagram account is stored under its IG User ID, so "already
    // connected" is decided by that id rather than the Page's.
    const identify = (page: FacebookPage) =>
      platform === 'instagram' ? page.instagramBusinessAccount?.id : page.id;

    const connected = availablePages
      .filter(page => {
        const id = identify(page);
        return !!id && connectedPageIds.has(id);
      })
      .map(page => this.asConnectedAccount(page, platform));

    const available = availablePages.filter(page => {
      const id = identify(page);
      return !id || !connectedPageIds.has(id);
    });

    logger.info(
      { userId, platform, availableCount: available.length, connectedCount: connected.length },
      'Returning pages'
    );

    return { available, connected };
  }

  private pagesCacheKey(userId: string, platform: SocialPlatformKey): string {
    return `social:pages:${platform}:${userId}`;
  }

  private async readCachedPages(
    userId: string,
    platform: SocialPlatformKey
  ): Promise<FacebookPage[] | null> {
    const payload = await cacheGet<string>(this.pagesCacheKey(userId, platform));
    if (!payload) {
      return null;
    }

    try {
      return JSON.parse(decrypt(payload)) as FacebookPage[];
    } catch (error) {
      logger.warn(
        { userId, platform, error: error instanceof Error ? error.message : 'Unknown error' },
        'Discarding unreadable cached pages'
      );
      await cacheDelete(this.pagesCacheKey(userId, platform));
      return null;
    }
  }

  private async writeCachedPages(
    userId: string,
    platform: SocialPlatformKey,
    pages: FacebookPage[]
  ): Promise<void> {
    await cacheSet(
      this.pagesCacheKey(userId, platform),
      encrypt(JSON.stringify(pages)),
      env.SOCIAL_PAGES_CACHE_TTL_SECONDS
    );
  }

  async invalidatePagesCache(userId: string, platform: SocialPlatformKey): Promise<void> {
    await cacheDelete(this.pagesCacheKey(userId, platform));
  }

  private async resolvePlatformPages(
    userId: string,
    platform: SocialPlatformKey,
    platformAccounts: SocialMediaAccount[]
  ): Promise<FacebookPage[] | null> {
    if (platform !== 'facebook' && platform !== 'instagram') {
      return [];
    }

    const cached = await this.readCachedPages(userId, platform);
    if (cached) {
      logger.info({ userId, platform, pageCount: cached.length }, 'Serving pages from cache');
      return cached;
    }

    // Page rows hold Page tokens, which cannot list a user's Pages. The user
    // token lives on the connection record, so prefer it; the fallback covers
    // rows created before connection records were namespaced.
    const account =
      platformAccounts.find(acc => acc.longLivedToken && isConnectionRecordPageId(acc.pageId)) ??
      platformAccounts.find(acc => acc.longLivedToken);

    if (!account?.longLivedToken) {
      logger.error(
        { userId, platform, totalAccounts: platformAccounts.length },
        'No connected account with a usable token'
      );
      return null;
    }

    try {
      const decryptedToken = decrypt(account.longLivedToken);

      let pages = await fetchFacebookPages(decryptedToken);
      if (platform === 'instagram') {
        pages = await this.attachInstagramAccounts(pages, decryptedToken);
      }

      await this.writeCachedPages(userId, platform, pages);

      logger.info(
        { userId, platform, accountId: account.id, pageCount: pages.length },
        'Fetched pages from Facebook'
      );
      return pages;
    } catch (error) {
      logger.error(
        {
          userId,
          platform,
          accountId: account.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Failed to fetch pages from Facebook'
      );
      return null;
    }
  }

  /**
   * Present a connected entry under the id publishing actually addresses.
   *
   * Callers pick an account here and send its `id` back as the post's `pageId`,
   * which is then matched against the stored account. For Instagram that stored
   * id is the IG User ID, so returning the Page id would produce a selection
   * that resolves to no account at publish time.
   */
  private asConnectedAccount(page: FacebookPage, platform: SocialPlatformKey): FacebookPage {
    const instagram = page.instagramBusinessAccount;

    if (platform !== 'instagram' || !instagram) {
      return page;
    }

    return {
      ...page,
      id: instagram.id,
      name: instagram.username ? `@${instagram.username}` : page.name,
    };
  }

  /**
   * Pages with no linked Instagram account are returned with a null account
   * rather than dropped, so the picker can explain why they cannot be selected.
   */
  private async attachInstagramAccounts(
    pages: FacebookPage[],
    userAccessToken: string
  ): Promise<FacebookPage[]> {
    return Promise.all(
      pages.map(async page => ({
        ...page,
        instagramBusinessAccount: await fetchInstagramBusinessAccount(
          page.id,
          page.access_token || userAccessToken
        ),
      }))
    );
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

    // Instagram publishes against the IG User ID, not the Page id — but with the
    // Page's token. Storing the Page id here would address the wrong node.
    let pageId = facebookPageId;
    let pageName = page.name;
    let meta = page.category || null;

    if (platform === 'instagram') {
      const instagramAccount =
        page.instagramBusinessAccount ??
        (await fetchInstagramBusinessAccount(facebookPageId, accessToken));

      if (!instagramAccount) {
        throw createError.badRequest(
          `The Page "${page.name}" has no linked Instagram professional account. ` +
            'Link an Instagram Business or Creator account to this Page, then try again.'
        );
      }

      pageId = instagramAccount.id;
      pageName = instagramAccount.username ? `@${instagramAccount.username}` : page.name;
      meta = page.name;
    }

    const account = await socialMediaAccountRepository.create({
      userId,
      platform,
      pageId,
      pageName,
      meta,
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

    await this.invalidatePagesCache(account.userId, platform);

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
