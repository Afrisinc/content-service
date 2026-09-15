import type { SocialPlatform } from '@prisma/client';
import { metaClient } from '@/adapters/meta/metaClient';
import { env } from '@/config/env';
import { BadRequestError } from '@/utils/http-error';
import { getObjectStorage } from '@/storage';
import type { UploadInput, UploadResult } from '../contracts';
import type { PublishCredentials, PublishingProvider } from './provider';

async function publicVideoUrl(input: UploadInput): Promise<string> {
  if (input.video_url) {
    return input.video_url;
  }
  return getObjectStorage().signedUrl(input.video_key, env.STUDIO_S3_SIGNED_URL_TTL_SECONDS);
}

function caption(input: UploadInput): string {
  const tags = input.metadata.hashtags.map(tag => `#${tag.replace(/^#/, '')}`).join(' ');
  return `${input.metadata.description}\n\n${tags}`.trim().slice(0, 2200);
}

export class FacebookPublishingProvider implements PublishingProvider {
  readonly platform: SocialPlatform = 'facebook';
  readonly supportsScheduling = true;

  async uploadVideo(input: UploadInput, credentials: PublishCredentials): Promise<UploadResult> {
    const fileUrl = await publicVideoUrl(input);
    const scheduled = input.scheduled_for
      ? Math.floor(new Date(input.scheduled_for).getTime() / 1000)
      : undefined;

    const response = await metaClient.uploadVideo(credentials.accountId, {
      access_token: credentials.accessToken,
      file_url: fileUrl,
      title: input.metadata.title.slice(0, 255),
      description: caption(input),
      published: !scheduled,
      scheduled_publish_time: scheduled,
    });

    const externalId = response.post_id ?? response.id;
    return {
      external_id: externalId,
      external_url: response.permalink_url,
      status: scheduled ? 'scheduled' : 'published',
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async updateMetadata(): Promise<void> {
    throw new BadRequestError('facebook video metadata is set at upload time');
  }

  async publish(externalId: string, credentials: PublishCredentials): Promise<UploadResult> {
    return this.getStatus(externalId, credentials);
  }

  async getStatus(externalId: string, credentials: PublishCredentials): Promise<UploadResult> {
    const permalink = await metaClient.getPermalink(externalId, credentials.accessToken);
    return { external_id: externalId, external_url: permalink, status: 'published' };
  }
}

export class InstagramPublishingProvider implements PublishingProvider {
  readonly platform: SocialPlatform = 'instagram';
  readonly supportsScheduling = false;

  async uploadVideo(input: UploadInput, credentials: PublishCredentials): Promise<UploadResult> {
    const videoUrl = await publicVideoUrl(input);

    const containerId = await metaClient.createInstagramContainer(credentials.accountId, {
      access_token: credentials.accessToken,
      video_url: videoUrl,
      media_type: input.format === '9:16' ? 'REELS' : 'VIDEO',
      caption: caption(input),
      is_ai_generated: true,
    });

    await metaClient.waitForInstagramContainer(containerId, credentials.accessToken, true);
    return { external_id: containerId, status: 'uploaded' };
  }

  async updateMetadata(): Promise<void> {
    throw new BadRequestError('instagram captions are set on the container before publishing');
  }

  async publish(externalId: string, credentials: PublishCredentials): Promise<UploadResult> {
    const response = await metaClient.publishInstagramContainer(
      credentials.accountId,
      externalId,
      credentials.accessToken
    );
    const mediaId = response.id;
    const permalink = await metaClient.getPermalink(mediaId, credentials.accessToken);

    return {
      external_id: mediaId,
      external_url: permalink ?? response.permalink,
      status: 'published',
      raw: response as unknown as Record<string, unknown>,
    };
  }

  async getStatus(externalId: string, credentials: PublishCredentials): Promise<UploadResult> {
    const permalink = await metaClient.getPermalink(externalId, credentials.accessToken);
    return {
      external_id: externalId,
      external_url: permalink,
      status: permalink ? 'published' : 'processing',
    };
  }
}
