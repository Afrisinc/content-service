import { Prisma, SocialPlatform } from '@prisma/client';
import { env } from '@/config/env';
import { BadRequestError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { recordPublish } from '@/observability/metrics';
import { decryptToken } from '@/utils/oauthToken';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import { productionRepository } from '@/repositories/production.repository';
import { socialMediaAccountRepository } from '@/repositories/socialMediaAccount.repository';
import { getObjectStorage } from '@/storage';
import {
  platformCopySchema,
  type PlatformMetadata,
  type Story,
  type UploadInput,
} from '@/studio/contracts';
import { generateStructured } from '@/studio/directors';
import { loadPrompt } from '@/studio/prompts/prompt.loader';
import { getPublishingProvider, type PublishCredentials } from '@/studio/publishing';
import { publishJob, type StudioQueue } from '@/queues';

const QUEUE_BY_PLATFORM: Partial<Record<SocialPlatform, StudioQueue>> = {
  youtube: 'publish.youtube',
  instagram: 'publish.instagram',
  facebook: 'publish.facebook',
  tiktok: 'publish.tiktok',
};

export class ProductionPublishingService {
  async writeMetadata(productionId: string): Promise<PlatformMetadata[]> {
    const production = await productionRepository.findById(productionId);
    const stored = await productionRepository.getStory(productionId);
    if (!production || !stored) {
      throw new NotFoundError('this production has no story yet');
    }

    const story = stored.spec as unknown as Story;
    const prompt = loadPrompt('publishing/social_copy');

    const result = await generateStructured({
      stage: 'publishing-copy',
      schema: platformCopySchema,
      prompt: prompt.render({
        story: {
          title: story.title,
          logline: story.logline,
          synopsis: story.synopsis,
          genre: story.genre,
          themes: story.themes,
        },
        platforms: production.platforms.join(', '),
        language: production.language,
      }),
      temperature: 0.6,
    });

    const byPlatform = new Map(
      result.data.variants.map(variant => [variant.platform, variant] as const)
    );
    const variants = await productionJobRepository.variants(productionId);

    for (const variant of variants) {
      const metadata = byPlatform.get(variant.platform as PlatformMetadata['platform']);
      if (!metadata) {
        continue;
      }
      await productionJobRepository.upsertVariant(productionId, variant.platform, variant.format, {
        renderOutputId: variant.renderOutputId,
        subtitleId: variant.subtitleId,
        thumbnailId: variant.thumbnailId,
        storageKey: variant.storageKey,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        hashtags: metadata.hashtags,
        status: 'PENDING',
        metadata: metadata as unknown as Prisma.InputJsonValue,
      });
    }

    return result.data.variants;
  }

  async queuePublishing(productionId: string, scheduledFor?: Date): Promise<number> {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const variants = await productionJobRepository.variants(productionId);
    const subtitle = (await productionJobRepository.subtitles(productionId, 'SRT'))[0];
    const thumbnail = await productionJobRepository.selectedThumbnail(productionId);

    let queued = 0;

    for (const variant of variants) {
      if (!variant.storageKey || !variant.title) {
        continue;
      }

      const queue = QUEUE_BY_PLATFORM[variant.platform];
      if (!queue) {
        continue;
      }

      const idempotencyKey = `publish:${productionId}:${variant.platform}:${variant.format}`;
      const existing = await productionJobRepository.findPublishingJobByKey(idempotencyKey);
      if (existing && existing.status !== 'FAILED' && existing.status !== 'DEAD_LETTER') {
        continue;
      }

      const account = await this.resolveAccount(production.userId, variant.platform);

      const job = existing
        ? await productionJobRepository.updatePublishingJob(existing.id, {
            status: 'QUEUED',
            scheduledFor: scheduledFor ?? null,
            error: null,
            errorCode: null,
          })
        : await productionJobRepository.createPublishingJob({
            productionId,
            variantId: variant.id,
            platform: variant.platform,
            integrationId: account?.id ?? null,
            accountRef: account?.pageId ?? null,
            idempotencyKey,
            scheduledFor: scheduledFor ?? null,
            status: 'QUEUED',
          });

      await publishJob(
        queue,
        {
          publishing_job_id: job.id,
          production_id: productionId,
          variant_id: variant.id,
          platform: variant.platform,
          format: variant.format,
          video_key: variant.storageKey,
          thumbnail_key: thumbnail?.storageKey,
          subtitle_key: subtitle?.storageKey,
          idempotency_key: idempotencyKey,
          scheduled_for: scheduledFor?.toISOString(),
        },
        { productionId, idempotencyKey }
      );

      queued += 1;
    }

    logger.info({ productionId, queued }, 'studio.publishing.queued');
    return queued;
  }

  async publishVariant(input: {
    publishingJobId: string;
    productionId: string;
    variantId: string;
    platform: SocialPlatform;
    format: string;
    videoKey: string;
    thumbnailKey?: string;
    subtitleKey?: string;
    idempotencyKey: string;
    scheduledFor?: string;
  }): Promise<void> {
    const existing = await productionJobRepository.findPublishingJobByKey(input.idempotencyKey);
    if (existing?.status === 'SUCCEEDED' && existing.externalId) {
      logger.info(
        { key: input.idempotencyKey, externalId: existing.externalId },
        'studio.publish.already_done'
      );
      return;
    }

    const production = await productionRepository.findById(input.productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const variants = await productionJobRepository.variants(input.productionId);
    const variant = variants.find(entry => entry.id === input.variantId);
    if (!variant || !variant.title) {
      throw new BadRequestError('this variant has no platform metadata yet');
    }

    const credentials = await this.credentialsFor(production.userId, input.platform);
    const provider = getPublishingProvider(input.platform);
    const storage = getObjectStorage();

    const uploadInput: UploadInput = {
      production_id: input.productionId,
      variant_id: input.variantId,
      platform: input.platform as UploadInput['platform'],
      format: input.format as UploadInput['format'],
      video_key: input.videoKey,
      video_url: await storage.signedUrl(input.videoKey, env.STUDIO_S3_SIGNED_URL_TTL_SECONDS),
      thumbnail_key: input.thumbnailKey,
      subtitle_key: input.subtitleKey,
      idempotency_key: input.idempotencyKey,
      scheduled_for: input.scheduledFor,
      metadata: {
        platform: input.platform as PlatformMetadata['platform'],
        title: variant.title,
        description: variant.description ?? '',
        tags: variant.tags,
        hashtags: variant.hashtags,
        privacy: 'public',
        made_for_kids: false,
      },
    };

    await productionJobRepository.updatePublishingJob(input.publishingJobId, {
      status: 'RUNNING',
      attempts: { increment: 1 },
    });

    try {
      const uploaded = await provider.uploadVideo(uploadInput, credentials);
      const finished =
        uploaded.status === 'uploaded' && input.platform === 'instagram'
          ? await provider.publish(uploaded.external_id, credentials)
          : uploaded;

      await productionJobRepository.updatePublishingJob(input.publishingJobId, {
        status: finished.status === 'failed' ? 'FAILED' : 'SUCCEEDED',
        externalId: finished.external_id,
        externalUrl: finished.external_url ?? null,
        publishedAt: finished.status === 'published' ? new Date() : null,
        response: (finished.raw ?? {}) as Prisma.InputJsonValue,
      });

      await productionJobRepository.upsertVariant(
        input.productionId,
        variant.platform,
        variant.format,
        {
          renderOutputId: variant.renderOutputId,
          subtitleId: variant.subtitleId,
          thumbnailId: variant.thumbnailId,
          storageKey: variant.storageKey,
          title: variant.title,
          description: variant.description,
          tags: variant.tags,
          hashtags: variant.hashtags,
          status: 'SUCCEEDED',
        }
      );

      recordPublish(input.platform, 'succeeded');
      logger.info(
        {
          productionId: input.productionId,
          platform: input.platform,
          externalId: finished.external_id,
        },
        'studio.publish.completed'
      );
    } catch (err) {
      recordPublish(input.platform, 'failed');
      await productionJobRepository.updatePublishingJob(input.publishingJobId, {
        status: 'FAILED',
        errorCode: err instanceof Error ? err.name : 'UNKNOWN',
        error: err instanceof Error ? err.message.slice(0, 1000) : String(err).slice(0, 1000),
      });
      throw err;
    }
  }

  private async resolveAccount(userId: string, platform: SocialPlatform) {
    const accounts = await socialMediaAccountRepository.findAllByUser(userId);
    return accounts.find(account => account.platform === platform && account.isActive) ?? null;
  }

  private async credentialsFor(
    userId: string,
    platform: SocialPlatform
  ): Promise<PublishCredentials> {
    const account = await this.resolveAccount(userId, platform);
    if (!account) {
      throw new BadRequestError(`no connected ${platform} account for this user`);
    }

    const encrypted = account.accessToken ?? account.longLivedToken ?? account.shortLivedToken;
    if (!encrypted) {
      throw new BadRequestError(`the connected ${platform} account has no usable access token`);
    }

    return {
      accessToken: decryptToken(encrypted),
      refreshToken: account.refreshToken ? decryptToken(account.refreshToken) : undefined,
      accountId: account.pageId,
      expiresAt: account.longLivedExpiresAt ?? account.tokenExpiresAt,
    };
  }
}

export const productionPublishingService = new ProductionPublishingService();
