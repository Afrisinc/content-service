import axios, { isAxiosError } from 'axios';
import type { SocialPlatform } from '@prisma/client';
import { env } from '@/config/env';
import { BadRequestError, ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { getObjectStorage } from '@/storage';
import type { UploadInput, UploadResult } from '../contracts';
import type { PublishCredentials, PublishingProvider } from './provider';

const API = 'https://open.tiktokapis.com/v2';

interface InitResponse {
  data: { publish_id: string };
  error?: { code: string; message: string };
}

interface StatusResponse {
  data: { status: string; publicaly_available_post_id?: string[]; fail_reason?: string };
  error?: { code: string; message: string };
}

function buildCaption(title: string, hashtags: string[]): string {
  const tags = hashtags.map(tag => `#${tag.replace(/^#/, '')}`).join(' ');
  return `${title} ${tags}`.trim().slice(0, 2200);
}

export class TikTokPublishingProvider implements PublishingProvider {
  readonly platform: SocialPlatform = 'tiktok';
  readonly supportsScheduling = false;

  async uploadVideo(input: UploadInput, credentials: PublishCredentials): Promise<UploadResult> {
    const storage = getObjectStorage();
    const sourceUrl =
      input.video_url ??
      (await storage.signedUrl(input.video_key, env.STUDIO_S3_SIGNED_URL_TTL_SECONDS));

    try {
      const response = await axios.post<InitResponse>(
        `${API}/post/publish/video/init/`,
        {
          post_info: {
            title: buildCaption(input.metadata.title, input.metadata.hashtags),
            privacy_level: input.metadata.privacy === 'public' ? 'PUBLIC_TO_EVERYONE' : 'SELF_ONLY',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: sourceUrl,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        }
      );

      if (response.data.error && response.data.error.code !== 'ok') {
        throw new BadRequestError(`tiktok rejected the post: ${response.data.error.message}`);
      }

      return {
        external_id: response.data.data.publish_id,
        status: 'processing',
      };
    } catch (err) {
      throw this.describe('initiating the upload', err);
    }
  }

  async updateMetadata(): Promise<void> {
    throw new BadRequestError('tiktok does not support editing a post after it is published');
  }

  async publish(externalId: string, credentials: PublishCredentials): Promise<UploadResult> {
    return this.getStatus(externalId, credentials);
  }

  async getStatus(externalId: string, credentials: PublishCredentials): Promise<UploadResult> {
    try {
      const response = await axios.post<StatusResponse>(
        `${API}/post/publish/status/fetch/`,
        { publish_id: externalId },
        {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
        }
      );

      const data = response.data.data;
      const postId = data.publicaly_available_post_id?.[0];
      const status =
        data.status === 'PUBLISH_COMPLETE'
          ? 'published'
          : data.status === 'FAILED'
            ? 'failed'
            : 'processing';

      return {
        external_id: externalId,
        external_url: postId
          ? `https://www.tiktok.com/@${credentials.accountId}/video/${postId}`
          : undefined,
        status,
        raw: data as unknown as Record<string, unknown>,
      };
    } catch (err) {
      throw this.describe('reading status', err);
    }
  }

  private describe(operation: string, err: unknown): Error {
    if (isAxiosError(err) && err.response) {
      const detail = JSON.stringify(err.response.data).slice(0, 400);
      if (err.response.status === 400 || err.response.status === 401) {
        return new BadRequestError(`tiktok rejected ${operation}: ${detail}`);
      }
      logger.error({ operation, status: err.response.status, detail }, 'tiktok api error');
      return new ServerError(`tiktok error while ${operation}`);
    }
    return new ServerError(`tiktok unreachable while ${operation}`);
  }
}
