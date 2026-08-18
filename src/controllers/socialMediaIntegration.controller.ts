/**
 * Social Media Integration Controller
 * Handles HTTP requests for platform connections and their accounts
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { createError } from '@/middlewares/errorHandler';
import { ApiResponseHelper, ResponseCode } from '@/utils/apiResponse';
import { logger } from '@/utils/logger';
import { SocialMediaIntegrationService } from '@/services/socialMediaIntegration.service';
import { SOCIAL_PLATFORMS, SocialPlatformKey } from '@/types/socialMediaIntegration.types';

const service = new SocialMediaIntegrationService();

function assertPlatform(platform: string): SocialPlatformKey {
  if (!(SOCIAL_PLATFORMS as readonly string[]).includes(platform)) {
    throw createError.badRequest(`Unsupported platform "${platform}"`);
  }
  return platform as SocialPlatformKey;
}

export async function listIntegrations(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user!.userId;

  const platforms = await service.listIntegrations(userId);

  return ApiResponseHelper.success(
    reply,
    'Connected platforms retrieved successfully',
    { platforms },
    ResponseCode.SUCCESS,
    200
  );
}

export async function saveIntegrationCredentials(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user!.userId;
  const { platform } = request.params as { platform: string };
  const body = request.body as { appId: string; appSecret: string; callbackUrl?: string };

  const platformKey = assertPlatform(platform);

  logger.info({ userId, platform: platformKey }, 'Saving social media integration credentials');

  const integration = await service.saveCredentials(
    userId,
    platformKey,
    body.appId.trim(),
    body.appSecret.trim(),
    body.callbackUrl?.trim()
  );

  return ApiResponseHelper.success(
    reply,
    `${platformKey} credentials saved`,
    integration,
    ResponseCode.UPDATED,
    200
  );
}

export async function updateIntegrationCredentials(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user!.userId;
  const { platform } = request.params as { platform: string };
  const body = request.body as { appId: string; appSecret?: string; callbackUrl?: string };

  const platformKey = assertPlatform(platform);

  logger.info({ userId, platform: platformKey }, 'Updating social media integration credentials');

  const integration = await service.updateCredentials(
    userId,
    platformKey,
    body.appId.trim(),
    body.appSecret?.trim(),
    body.callbackUrl?.trim()
  );

  return ApiResponseHelper.success(
    reply,
    `${platformKey} credentials updated`,
    integration,
    ResponseCode.UPDATED,
    200
  );
}

export async function addSocialMediaAccount(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user!.userId;
  const { platform } = request.params as { platform: string };
  const body = request.body as {
    name: string;
    meta?: string;
    scopes?: string[];
    accessToken?: string;
    expiresIn?: number;
  };

  const platformKey = assertPlatform(platform);
  const name = body.name.trim();

  logger.info(
    { userId, platform: platformKey, name, scopes: body.scopes },
    'Adding social media account'
  );

  const account = await service.addAccount(userId, platformKey, {
    name,
    meta: body.meta?.trim(),
    scopes: body.scopes ?? [],
    accessToken: body.accessToken,
    expiresIn: body.expiresIn,
  });

  return ApiResponseHelper.created(reply, `${name} connected to ${platformKey}`, account);
}

export async function handleOAuthCallback(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { platform } = request.params as { platform: string };
  const { code, state } = request.query as { code: string; state: string };

  if (!code || !state) {
    throw createError.badRequest('Missing required OAuth parameters: code and state');
  }

  const platformKey = assertPlatform(platform);
  const redirectUri = new URL(request.url, `${request.protocol}://${request.hostname}`)
    .toString()
    .split('?')[0];

  logger.info({ platform: platformKey }, 'Processing OAuth callback');

  const result = await service.handleOAuthCallback(platformKey, code, state, redirectUri);

  return ApiResponseHelper.success(
    reply,
    `${platformKey} account connected successfully`,
    result,
    ResponseCode.SUCCESS,
    200
  );
}

export async function getAvailablePages(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user!.userId;
  const { platform } = request.params as { platform: string };

  const platformKey = assertPlatform(platform);

  logger.info({ userId, platform: platformKey }, 'Fetching available pages');

  const pages = await service.getAvailablePages(userId, platformKey);

  return ApiResponseHelper.success(
    reply,
    'Available and connected pages retrieved',
    pages,
    ResponseCode.SUCCESS,
    200
  );
}

export async function addAccountFromFacebookPage(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const userId = request.user!.userId;
  const { platform, pageId } = request.params as { platform: string; pageId: string };
  const body = request.body as {
    pageName: string;
    scopes: string[];
    accessToken: string;
  };

  const platformKey = assertPlatform(platform);

  logger.info(
    { userId, platform: platformKey, pageId },
    'Adding social media account from Facebook page'
  );

  const account = await service.addAccountFromFacebookPage(
    userId,
    platformKey,
    pageId,
    {
      id: pageId,
      name: body.pageName,
    },
    body.scopes,
    body.accessToken
  );

  return ApiResponseHelper.created(reply, `${body.pageName} connected to ${platformKey}`, account);
}

export async function deleteAccount(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const userId = request.user!.userId;
  const { accountId } = request.params as { accountId: string };

  logger.info({ userId, accountId }, 'Deleting social media account');

  await service.deleteAccount(userId, accountId);

  return ApiResponseHelper.success(
    reply,
    'Account deleted successfully',
    {},
    ResponseCode.SUCCESS,
    200
  );
}
