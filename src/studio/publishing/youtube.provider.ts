import axios, { isAxiosError } from 'axios';
import type { SocialPlatform } from '@prisma/client';
import { env } from '@/config/env';
import { BadRequestError, ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { getObjectStorage } from '@/storage';
import type { UploadInput, UploadResult } from '../contracts';
import type { PublishCredentials, PublishingProvider } from './provider';

const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
const API_URL = 'https://www.googleapis.com/youtube/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CHUNK_BYTES = 8 * 1024 * 1024;

const PRIVACY = { public: 'public', unlisted: 'unlisted', private: 'private' } as const;

export class YouTubePublishingProvider implements PublishingProvider {
  readonly platform: SocialPlatform = 'youtube';
  readonly supportsScheduling = true;

  async refresh(credentials: PublishCredentials): Promise<string> {
    if (!credentials.refreshToken) {
      return credentials.accessToken;
    }
    try {
      const response = await axios.post<{ access_token: string }>(TOKEN_URL, {
        client_id: env.YOUTUBE_CLIENT_ID,
        client_secret: env.YOUTUBE_CLIENT_SECRET,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token',
      });
      return response.data.access_token;
    } catch (err) {
      logger.error({ error: String(err) }, 'youtube token refresh failed');
      throw new ServerError('youtube token refresh failed');
    }
  }

  async uploadVideo(input: UploadInput, credentials: PublishCredentials): Promise<UploadResult> {
    const accessToken = credentials.accessToken;
    const body = await getObjectStorage().get(input.video_key);

    const metadata = {
      snippet: {
        title: input.metadata.title.slice(0, 100),
        description: input.metadata.description.slice(0, 5000),
        tags: input.metadata.tags.slice(0, 15),
        categoryId: input.metadata.category ?? env.YOUTUBE_DEFAULT_CATEGORY_ID,
      },
      status: {
        privacyStatus: input.scheduled_for ? PRIVACY.private : PRIVACY[input.metadata.privacy],
        selfDeclaredMadeForKids: input.metadata.made_for_kids,
        ...(input.scheduled_for ? { publishAt: input.scheduled_for } : {}),
      },
    };

    let sessionUrl: string;
    try {
      const session = await axios.post(UPLOAD_URL, metadata, {
        params: { uploadType: 'resumable', part: 'snippet,status' },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': String(body.byteLength),
        },
      });
      sessionUrl = String(session.headers.location ?? '');
    } catch (err) {
      throw this.describe('starting the upload session', err);
    }

    if (!sessionUrl) {
      throw new ServerError('youtube did not return an upload session');
    }

    const videoId = await this.uploadChunks(sessionUrl, body, accessToken);

    if (input.thumbnail_key) {
      await this.setThumbnail(videoId, input.thumbnail_key, accessToken).catch(err =>
        logger.warn({ videoId, error: String(err) }, 'youtube thumbnail upload failed')
      );
    }

    if (input.subtitle_key) {
      await this.uploadCaptions(videoId, input.subtitle_key, accessToken).catch(err =>
        logger.warn({ videoId, error: String(err) }, 'youtube caption upload failed')
      );
    }

    return {
      external_id: videoId,
      external_url: `https://www.youtube.com/watch?v=${videoId}`,
      status: input.scheduled_for ? 'scheduled' : 'uploaded',
    };
  }

  private async uploadChunks(
    sessionUrl: string,
    body: Buffer,
    accessToken: string
  ): Promise<string> {
    let offset = 0;

    while (offset < body.byteLength) {
      const end = Math.min(offset + CHUNK_BYTES, body.byteLength);
      const chunk = body.subarray(offset, end);

      try {
        const response = await axios.put<{ id?: string }>(sessionUrl, chunk, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'video/mp4',
            'Content-Range': `bytes ${offset}-${end - 1}/${body.byteLength}`,
          },
          validateStatus: status => status === 200 || status === 201 || status === 308,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        if (response.status === 200 || response.status === 201) {
          const id = response.data?.id;
          if (!id) {
            throw new ServerError('youtube finished the upload without returning a video id');
          }
          return id;
        }

        const range = String(response.headers.range ?? '');
        const resumed = range.includes('-') ? Number(range.split('-')[1]) + 1 : end;
        offset = Number.isFinite(resumed) ? resumed : end;
      } catch (err) {
        throw this.describe('uploading a chunk', err);
      }
    }

    throw new ServerError('youtube upload ended without a video id');
  }

  private async setThumbnail(videoId: string, key: string, accessToken: string): Promise<void> {
    const body = await getObjectStorage().get(key);
    await axios.post('https://www.googleapis.com/upload/youtube/v3/thumbnails/set', body, {
      params: { videoId, uploadType: 'media' },
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'image/jpeg' },
    });
  }

  private async uploadCaptions(videoId: string, key: string, accessToken: string): Promise<void> {
    const body = await getObjectStorage().get(key);
    await axios.post('https://www.googleapis.com/upload/youtube/v3/captions', body, {
      params: { part: 'snippet', uploadType: 'media' },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
      },
    });
  }

  async updateMetadata(
    externalId: string,
    input: UploadInput,
    credentials: PublishCredentials
  ): Promise<void> {
    try {
      await axios.put(
        `${API_URL}/videos`,
        {
          id: externalId,
          snippet: {
            title: input.metadata.title.slice(0, 100),
            description: input.metadata.description.slice(0, 5000),
            tags: input.metadata.tags.slice(0, 15),
            categoryId: input.metadata.category ?? env.YOUTUBE_DEFAULT_CATEGORY_ID,
          },
        },
        {
          params: { part: 'snippet' },
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
        }
      );
    } catch (err) {
      throw this.describe('updating metadata', err);
    }
  }

  async publish(externalId: string, credentials: PublishCredentials): Promise<UploadResult> {
    try {
      await axios.put(
        `${API_URL}/videos`,
        { id: externalId, status: { privacyStatus: 'public' } },
        {
          params: { part: 'status' },
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
        }
      );
    } catch (err) {
      throw this.describe('publishing', err);
    }

    return {
      external_id: externalId,
      external_url: `https://www.youtube.com/watch?v=${externalId}`,
      status: 'published',
    };
  }

  async getStatus(externalId: string, credentials: PublishCredentials): Promise<UploadResult> {
    try {
      const response = await axios.get<{
        items: Array<{ status: { uploadStatus: string; privacyStatus: string } }>;
      }>(`${API_URL}/videos`, {
        params: { id: externalId, part: 'status' },
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
      });

      const item = response.data.items[0];
      if (!item) {
        throw new BadRequestError(`youtube video ${externalId} was not found`);
      }

      const uploadStatus = item.status.uploadStatus;
      const status =
        uploadStatus === 'processed'
          ? item.status.privacyStatus === 'public'
            ? 'published'
            : 'scheduled'
          : uploadStatus === 'failed'
            ? 'failed'
            : 'processing';

      return {
        external_id: externalId,
        external_url: `https://www.youtube.com/watch?v=${externalId}`,
        status,
        raw: item as unknown as Record<string, unknown>,
      };
    } catch (err) {
      throw this.describe('reading status', err);
    }
  }

  private describe(operation: string, err: unknown): Error {
    if (isAxiosError(err) && err.response) {
      const detail = JSON.stringify(err.response.data).slice(0, 400);
      if (err.response.status === 400 || err.response.status === 403) {
        return new BadRequestError(`youtube rejected ${operation}: ${detail}`);
      }
      logger.error({ operation, status: err.response.status, detail }, 'youtube api error');
      return new ServerError(`youtube error while ${operation}`);
    }
    return new ServerError(`youtube unreachable while ${operation}`);
  }
}
