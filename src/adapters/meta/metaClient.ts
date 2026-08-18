/**
 * Meta Client
 * Handles Facebook Graph API and Instagram Graph API calls.
 *
 * Media is published through the endpoints that actually render it:
 *   - photos  -> POST /{page-id}/photos
 *   - videos  -> POST /{page-id}/videos
 *   - text    -> POST /{page-id}/feed
 * Multi-photo posts upload unpublished photos first, then reference their ids
 * through `attached_media` on /feed.
 *
 * Instagram publishes in two steps: create a media container, poll it until it
 * reports FINISHED, then publish it via /media_publish.
 */

import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';
import {
  MetaPostResponse,
  MetaPlatform,
  MetaFeedRequest,
  MetaPhotoRequest,
  MetaVideoRequest,
  MetaBinaryMedia,
  InstagramContainerRequest,
  InstagramContainerStatus,
} from './meta.types';

export class MetaClient {
  private client: AxiosInstance;
  /** Pinned deliberately. Meta supports a version for ~2 years; v26.0 is current. */
  private readonly API_VERSION = 'v24.0';
  private readonly GRAPH_API_BASE = 'https://graph.facebook.com';
  private readonly DEFAULT_TIMEOUT = 30000;
  /** Video uploads stream a whole file; they need far longer than a form post. */
  private readonly UPLOAD_TIMEOUT = 300000;
  private readonly MAX_RETRIES = 3;
  /** Instagram container processing: poll up to ~60s before giving up. */
  private readonly CONTAINER_POLL_INTERVAL = 3000;
  private readonly CONTAINER_MAX_POLLS = 20;

  constructor() {
    this.client = axios.create({
      timeout: this.DEFAULT_TIMEOUT,
    });
  }

  // ---------------------------------------------------------------------------
  // Facebook
  // ---------------------------------------------------------------------------

  /**
   * Publish a text and/or link post to a Page feed.
   * Also used to publish multi-photo posts via `attached_media`.
   */
  async postToFeed(pageId: string, payload: MetaFeedRequest): Promise<MetaPostResponse> {
    const url = this.edge(pageId, 'feed');

    logger.debug(
      { pageId, hasAttachments: !!payload.attached_media?.length },
      '[MetaClient] Feed post'
    );

    try {
      const response = await this.executeWithRetry(() =>
        this.client.post<MetaPostResponse>(url, this.toFormBody(payload), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      logger.info({ postId: response.data.id, pageId }, '[MetaClient] Feed post published');
      return response.data;
    } catch (error) {
      this.handleError(error, 'Facebook feed post');
    }
  }

  /**
   * Upload a photo to a Page.
   *
   * Pass `published: false` to stage an image for a multi-photo post; the
   * returned `id` is then used as an `attached_media` media_fbid.
   * When `binary` is supplied the image is uploaded as multipart/form-data,
   * which works for media Meta's servers cannot reach on their own.
   */
  async uploadPhoto(
    pageId: string,
    payload: MetaPhotoRequest,
    binary?: MetaBinaryMedia
  ): Promise<MetaPostResponse> {
    const url = this.edge(pageId, 'photos');

    logger.debug(
      { pageId, published: payload.published !== false, viaBinary: !!binary },
      '[MetaClient] Photo upload'
    );

    try {
      const response = await this.executeWithRetry(() =>
        binary
          ? this.client.post<MetaPostResponse>(url, this.toMultipart(payload, binary, 'source'), {
              timeout: this.UPLOAD_TIMEOUT,
            })
          : this.client.post<MetaPostResponse>(url, this.toFormBody(payload), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            })
      );

      logger.info(
        { photoId: response.data.id, postId: response.data.post_id, pageId },
        '[MetaClient] Photo uploaded'
      );
      return response.data;
    } catch (error) {
      this.handleError(error, 'Facebook photo upload');
    }
  }

  /**
   * Upload a video to a Page.
   * `file_url` lets Meta fetch the video directly; `binary` streams it instead.
   */
  async uploadVideo(
    pageId: string,
    payload: MetaVideoRequest,
    binary?: MetaBinaryMedia
  ): Promise<MetaPostResponse> {
    const url = this.edge(pageId, 'videos');

    logger.debug({ pageId, viaBinary: !!binary }, '[MetaClient] Video upload');

    try {
      const response = await this.executeWithRetry(() =>
        binary
          ? this.client.post<MetaPostResponse>(url, this.toMultipart(payload, binary, 'source'), {
              timeout: this.UPLOAD_TIMEOUT,
            })
          : this.client.post<MetaPostResponse>(url, this.toFormBody(payload), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              timeout: this.UPLOAD_TIMEOUT,
            })
      );

      logger.info({ videoId: response.data.id, pageId }, '[MetaClient] Video uploaded');
      return response.data;
    } catch (error) {
      this.handleError(error, 'Facebook video upload');
    }
  }

  // ---------------------------------------------------------------------------
  // Instagram
  // ---------------------------------------------------------------------------

  /**
   * Create an Instagram media container.
   * Returns the container id, which must be published separately.
   */
  async createInstagramContainer(
    igUserId: string,
    payload: InstagramContainerRequest
  ): Promise<string> {
    const url = this.edge(igUserId, 'media');

    logger.debug(
      { igUserId, mediaType: payload.media_type, isChild: !!payload.is_carousel_item },
      '[MetaClient] Creating Instagram container'
    );

    try {
      const response = await this.executeWithRetry(() =>
        this.client.post<{ id: string }>(url, this.toFormBody(payload), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );

      return response.data.id;
    } catch (error) {
      this.handleError(error, 'Instagram container creation');
    }
  }

  /**
   * Poll a container until Instagram finishes processing its media.
   * Videos in particular are not publishable the instant the container exists.
   */
  async waitForInstagramContainer(containerId: string, accessToken: string): Promise<void> {
    const url = `${this.GRAPH_API_BASE}/${this.API_VERSION}/${containerId}`;

    for (let poll = 1; poll <= this.CONTAINER_MAX_POLLS; poll++) {
      const response = await this.client.get<InstagramContainerStatus>(url, {
        params: { access_token: accessToken, fields: 'status_code,status' },
      });

      const { status_code: statusCode, status } = response.data;

      if (statusCode === 'FINISHED') {
        logger.debug({ containerId, poll }, '[MetaClient] Container ready');
        return;
      }

      if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
        throw new Error(`Instagram container ${statusCode}: ${status || 'no detail provided'}`);
      }

      await new Promise(resolve => setTimeout(resolve, this.CONTAINER_POLL_INTERVAL));
    }

    throw new Error(
      `Instagram container did not finish processing after ${this.CONTAINER_MAX_POLLS} polls`
    );
  }

  /**
   * Publish a finished Instagram container.
   */
  async publishInstagramContainer(
    igUserId: string,
    containerId: string,
    accessToken: string
  ): Promise<MetaPostResponse> {
    const url = this.edge(igUserId, 'media_publish');

    try {
      const response = await this.executeWithRetry(() =>
        this.client.post<MetaPostResponse>(
          url,
          this.toFormBody({ creation_id: containerId, access_token: accessToken }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        )
      );

      logger.info({ postId: response.data.id, igUserId }, '[MetaClient] Instagram media published');
      return response.data;
    } catch (error) {
      this.handleError(error, 'Instagram publish');
    }
  }

  // ---------------------------------------------------------------------------
  // Shared
  // ---------------------------------------------------------------------------

  /**
   * Fetch the permalink for a published post, so callers can link to it.
   * Failure is non-fatal — the post is already live at this point.
   */
  async getPermalink(postId: string, accessToken: string): Promise<string | undefined> {
    try {
      const response = await this.client.get<MetaPostResponse>(
        `${this.GRAPH_API_BASE}/${this.API_VERSION}/${postId}`,
        { params: { access_token: accessToken, fields: 'permalink_url' } }
      );
      return response.data.permalink_url;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ postId, error: message }, '[MetaClient] Could not fetch permalink');
      return undefined;
    }
  }

  async getPost(
    postId: string,
    accessToken: string,
    platform: MetaPlatform = MetaPlatform.FACEBOOK
  ): Promise<MetaPostResponse> {
    const url = `${this.GRAPH_API_BASE}/${this.API_VERSION}/${postId}`;
    const fields =
      platform === MetaPlatform.INSTAGRAM
        ? 'id,permalink,caption,media_type,timestamp'
        : 'id,permalink_url,created_time,message';

    try {
      const response = await this.executeWithRetry(() =>
        this.client.get<MetaPostResponse>(url, { params: { access_token: accessToken, fields } })
      );
      return response.data;
    } catch (error) {
      this.handleError(error, `Get post from ${platform}`);
    }
  }

  async deletePost(postId: string, accessToken: string): Promise<boolean> {
    const url = `${this.GRAPH_API_BASE}/${this.API_VERSION}/${postId}`;

    try {
      await this.executeWithRetry(() =>
        this.client.delete(url, { params: { access_token: accessToken } })
      );

      logger.info({ postId }, '[MetaClient] Post deleted');
      return true;
    } catch (error) {
      this.handleError(error, 'Delete post');
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private edge(nodeId: string, edge: string): string {
    return `${this.GRAPH_API_BASE}/${this.API_VERSION}/${nodeId}/${edge}`;
  }

  /**
   * Encode a payload as application/x-www-form-urlencoded.
   *
   * The Graph API expects structured values as JSON strings, and indexed keys
   * for attached_media (attached_media[0], attached_media[1], ...) rather than a
   * JSON array under a single key.
   */
  private toFormBody(payload: object): string {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }

      if (key === 'attached_media' && Array.isArray(value)) {
        value.forEach((item, index) => {
          params.append(`attached_media[${index}]`, JSON.stringify(item));
        });
        continue;
      }

      if (Array.isArray(value)) {
        // children (Instagram carousels) and similar list params are sent as CSV.
        params.append(key, value.join(','));
        continue;
      }

      if (typeof value === 'object') {
        params.append(key, JSON.stringify(value));
        continue;
      }

      params.append(key, String(value));
    }

    return params.toString();
  }

  /**
   * Build a multipart/form-data body carrying the media bytes under `fileField`.
   * Used when the media URL is not publicly reachable by Meta's servers.
   */
  private toMultipart(payload: object, binary: MetaBinaryMedia, fileField: string): FormData {
    const form = new FormData();

    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (value === undefined || value === null || value === '') {
        continue;
      }
      // A binary upload replaces the remote-fetch fields entirely.
      if (key === 'url' || key === 'file_url') {
        continue;
      }
      form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }

    const bytes = new Uint8Array(binary.buffer);
    form.append(fileField, new Blob([bytes], { type: binary.mimeType }), binary.filename);

    return form;
  }

  /**
   * Retry with exponential backoff. 4xx responses other than 429 are permanent
   * (bad token, bad permissions, malformed payload) and are not retried.
   */
  private async executeWithRetry<T>(request: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error as Error;

        // axios does not type its error shape; narrowing stops at this boundary.
        const statusCode = (error as any)?.response?.status;

        if (statusCode && statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          throw error;
        }

        logger.warn(
          { attempt, maxRetries: this.MAX_RETRIES, error: lastError.message, statusCode },
          `[MetaClient] Attempt ${attempt}/${this.MAX_RETRIES} failed`
        );

        if (attempt < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Surface Meta's own error text — its subcodes are the only way to tell
   * "token expired" apart from "missing pages_manage_posts" apart from "bad image".
   */
  private handleError(error: unknown, operation: string): never {
    // axios does not type its error shape; narrowing stops at this boundary.
    const axiosError = error as any;
    const statusCode = axiosError?.response?.status;
    const errorData = axiosError?.response?.data;
    const metaError = errorData?.error;

    let message = 'Unknown error';

    if (metaError) {
      if (typeof metaError === 'object') {
        const parts = [metaError.message, metaError.error_user_msg].filter(Boolean);
        message = parts.join(' — ') || `code ${metaError.code}`;
        if (metaError.code) {
          message += ` (code ${metaError.code}${
            metaError.error_subcode ? `/${metaError.error_subcode}` : ''
          })`;
        }
      } else {
        message = String(metaError);
      }
    } else if (errorData?.message) {
      message = errorData.message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    logger.error(
      { operation, statusCode, error: message, details: errorData },
      `[MetaClient] ${operation} failed`
    );

    throw new Error(`Meta API ${operation} failed: ${message}`);
  }
}

export const metaClient = new MetaClient();
