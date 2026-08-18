/**
 * Meta Payload Transformer
 *
 * Turns a generic SocialMediaPostPayload into the exact Graph API call each
 * platform needs. The constraints being satisfied here are documented in
 * meta.types.ts; the one that governs the whole design is that media cannot ride
 * along on /feed — a photo goes to /photos, a video to /videos, and an album is
 * composed from unpublished photo ids.
 */

import { SocialMediaPostPayload } from '@/types/socialMedia.types';
import { logger } from '@/utils/logger';
import { mediaDownloader, DownloadedMedia } from './mediaDownloader';
import {
  MetaPlatform,
  MetaPostKind,
  MetaFacebookPost,
  MetaBinaryMedia,
  MetaMediaSource,
  MetaFeedRequest,
  InstagramPost,
  InstagramContainerRequest,
  META_CAROUSEL_LIMITS,
  INSTAGRAM_CAPTION_MAX_LENGTH,
  FACEBOOK_MESSAGE_MAX_LENGTH,
} from './meta.types';

/**
 * Facebook has no API field for AI self-disclosure, so it is written into the
 * post body. Instagram has one (`is_ai_generated`) and gets the label instead.
 */
const AI_DISCLOSURE_LABEL = 'AI-assisted content';

/** Graph API rejects a scheduled time less than 10 minutes out. */
const FACEBOOK_MIN_SCHEDULE_LEAD_SECONDS = 600;
/**
 * …or more than 75 days out on /feed. /videos allows 6 months, but the tighter
 * feed limit is used everywhere so one scheduled post cannot be valid on one
 * edge and rejected on another.
 */
const FACEBOOK_MAX_SCHEDULE_LEAD_SECONDS = 75 * 24 * 60 * 60;

export class MetaPayloadTransformer {
  // ---------------------------------------------------------------------------
  // Facebook
  // ---------------------------------------------------------------------------

  /**
   * Resolve a payload into the single Facebook call that will render it.
   * The returned `kind` tells the caller which edge to post to.
   */
  async transformForFacebook(payload: SocialMediaPostPayload): Promise<MetaFacebookPost> {
    const message = this.buildBody(payload, FACEBOOK_MESSAGE_MAX_LENGTH, {
      disclose: !!payload.metadata?.aiGenerated,
    });
    const videoUrl = this.videoUrl(payload);
    const imageUrls = this.imageUrls(payload);
    const scheduledAt = this.facebookScheduleTime(payload);

    if (videoUrl) {
      const source = await this.resolveMedia(videoUrl, 'video');
      return {
        kind: MetaPostKind.VIDEO,
        video: {
          access_token: payload.accessToken,
          file_url: source.url,
          description: message || undefined,
          title: payload.content.name || undefined,
          ...this.scheduleFields(scheduledAt),
        },
        binary: source.binary,
      };
    }

    if (imageUrls.length === 1) {
      const source = await this.resolveMedia(imageUrls[0], 'image');
      return {
        kind: MetaPostKind.PHOTO,
        photo: {
          access_token: payload.accessToken,
          url: source.url,
          // `caption`, not `message` — /photos deprecated `message`.
          caption: message || undefined,
          alt_text_custom: payload.media?.alt_text || undefined,
          ...this.scheduleFields(scheduledAt),
        },
        binary: source.binary,
      };
    }

    if (imageUrls.length > 1) {
      const capped = this.capToCarouselLimit(imageUrls, MetaPlatform.FACEBOOK);
      const photos = await Promise.all(capped.map(url => this.resolveMedia(url, 'image')));

      return {
        kind: MetaPostKind.MULTI_PHOTO,
        photos: photos.map(source => ({ ...source, altText: payload.media?.alt_text })),
        feed: this.buildFeedRequest(payload, message, scheduledAt),
      };
    }

    return {
      kind: MetaPostKind.FEED,
      feed: this.buildFeedRequest(payload, message, scheduledAt),
    };
  }

  // ---------------------------------------------------------------------------
  // Instagram
  // ---------------------------------------------------------------------------

  /**
   * Resolve a payload into Instagram container(s).
   *
   * Instagram only ever fetches media from a public URL — there is no binary
   * upload path — so unreachable media is a hard failure here rather than a
   * silent text-only post.
   */
  async transformForInstagram(payload: SocialMediaPostPayload): Promise<InstagramPost> {
    const caption = this.buildBody(payload, INSTAGRAM_CAPTION_MAX_LENGTH, { disclose: false });
    const isAiGenerated = payload.metadata?.aiGenerated || undefined;
    const videoUrl = this.videoUrl(payload);
    const imageUrls = this.imageUrls(payload);

    if (videoUrl) {
      return {
        container: {
          access_token: payload.accessToken,
          media_type: 'REELS',
          video_url: this.requirePublicUrl(videoUrl),
          caption: caption || undefined,
          is_ai_generated: isAiGenerated,
        },
      };
    }

    if (imageUrls.length === 0) {
      throw new Error(
        'Instagram posts require an image or video — text-only posts are not supported'
      );
    }

    if (imageUrls.length === 1) {
      return {
        container: {
          access_token: payload.accessToken,
          image_url: this.requirePublicUrl(imageUrls[0]),
          caption: caption || undefined,
          alt_text: payload.media?.alt_text || undefined,
          is_ai_generated: isAiGenerated,
        },
      };
    }

    const capped = this.capToCarouselLimit(imageUrls, MetaPlatform.INSTAGRAM);

    return {
      // `children` is filled in by the caller once the child containers exist.
      container: {
        access_token: payload.accessToken,
        media_type: 'CAROUSEL',
        caption: caption || undefined,
        is_ai_generated: isAiGenerated,
      },
      childContainers: capped.map<InstagramContainerRequest>(url => ({
        access_token: payload.accessToken,
        image_url: this.requirePublicUrl(url),
        is_carousel_item: true,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  validateCarousel(
    urls: string[] | undefined,
    platform: MetaPlatform
  ): { valid: boolean; error?: string } {
    const config = META_CAROUSEL_LIMITS[platform];

    if (!urls || urls.length === 0) {
      return { valid: false, error: 'Carousel requires at least one media URL' };
    }

    if (urls.length < config.minItems) {
      return {
        valid: false,
        error: `Carousel requires at least ${config.minItems} items, got ${urls.length}`,
      };
    }

    if (urls.length > config.maxItems) {
      return {
        valid: false,
        error: `Carousel cannot exceed ${config.maxItems} items, got ${urls.length}`,
      };
    }

    return { valid: true };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private buildFeedRequest(
    payload: SocialMediaPostPayload,
    message: string,
    scheduledAt?: number
  ): MetaFeedRequest {
    return {
      access_token: payload.accessToken,
      message: message || undefined,
      link: payload.content.link || undefined,
      ...this.scheduleFields(scheduledAt),
    };
  }

  /**
   * Compose the visible post body: the message, then hashtags, then the AI
   * disclosure line. Truncated to the platform limit so Meta does not reject it.
   */
  private buildBody(
    payload: SocialMediaPostPayload,
    maxLength: number,
    options: { disclose: boolean }
  ): string {
    const blocks: string[] = [];

    const text = (payload.content.message || payload.content.caption || '').trim();
    if (text) {
      blocks.push(text);
    }

    const tags = this.normalizeTags(payload.content.tags);
    if (tags.length) {
      blocks.push(tags.map(tag => `#${tag}`).join(' '));
    }

    if (options.disclose) {
      blocks.push(AI_DISCLOSURE_LABEL);
    }

    const body = blocks.join('\n\n');

    if (body.length <= maxLength) {
      return body;
    }

    logger.warn({ length: body.length, maxLength }, '[MetaPayloadTransformer] Body truncated');
    return `${body.slice(0, maxLength - 1).trimEnd()}…`;
  }

  /**
   * Normalize free-form tag input into distinct, valid hashtag words.
   * Callers send anything from "travel" to "#a#b#c" to "two words"; Meta only
   * renders a hashtag when it is a single unbroken alphanumeric token.
   */
  private normalizeTags(tags?: string[]): string[] {
    if (!tags?.length) {
      return [];
    }

    const normalized = tags
      .flatMap(tag => tag.split('#'))
      .map(tag =>
        tag
          .trim()
          .replace(/\s+/g, '')
          .replace(/[^\p{L}\p{N}_]/gu, '')
      )
      .filter(Boolean);

    return [...new Set(normalized)];
  }

  /** Image URLs in post order, regardless of how the caller labelled the media. */
  private imageUrls(payload: SocialMediaPostPayload): string[] {
    const media = payload.media;
    if (!media || media.type === 'video') {
      return [];
    }

    if (media.urls?.length) {
      return media.urls.filter(Boolean);
    }
    return media.url ? [media.url] : [];
  }

  private videoUrl(payload: SocialMediaPostPayload): string | undefined {
    const media = payload.media;
    if (media?.type !== 'video') {
      return undefined;
    }
    return media.url || media.urls?.[0];
  }

  private capToCarouselLimit(urls: string[], platform: MetaPlatform): string[] {
    const { maxItems } = META_CAROUSEL_LIMITS[platform];
    if (urls.length <= maxItems) {
      return urls;
    }

    logger.warn(
      { platform, count: urls.length, maxItems },
      '[MetaPayloadTransformer] Carousel exceeds limit, truncating'
    );
    return urls.slice(0, maxItems);
  }

  /**
   * Decide how Meta should receive this media.
   *
   * A public https URL is handed over as-is — Meta fetches it directly, which is
   * both faster and more reliable than streaming bytes through this service.
   * Anything Meta cannot fetch (a data: URI, plain http) is downloaded here and
   * uploaded as multipart instead.
   */
  private async resolveMedia(url: string, kind: 'image' | 'video'): Promise<MetaMediaSource> {
    if (this.isPublicUrl(url)) {
      return { url };
    }

    logger.debug(
      { kind },
      '[MetaPayloadTransformer] Media not publicly fetchable, uploading bytes'
    );

    const media = await this.fetchMedia(url, kind);

    return {
      binary: {
        buffer: media.buffer,
        filename: media.filename,
        mimeType: media.mimeType,
      },
    };
  }

  /**
   * Download media so it can be uploaded as raw bytes.
   *
   * Facebook accepts either a URL it fetches itself or a multipart file
   * attachment; this is the second path, used when Meta cannot reach the host.
   * Instagram has no equivalent — it only ever cURLs a public URL.
   */
  async toBinary(url: string, kind: 'image' | 'video'): Promise<MetaBinaryMedia> {
    const media = await this.fetchMedia(url, kind);
    return {
      buffer: media.buffer,
      filename: media.filename,
      mimeType: media.mimeType,
    };
  }

  private async fetchMedia(url: string, kind: 'image' | 'video'): Promise<DownloadedMedia> {
    if (url.startsWith('data:')) {
      return mediaDownloader.base64ToBuffer(url);
    }
    if (kind === 'image') {
      return mediaDownloader.downloadImage(url);
    }
    return mediaDownloader.downloadVideo(url);
  }

  private requirePublicUrl(url: string): string {
    if (!this.isPublicUrl(url)) {
      throw new Error(
        'Instagram can only publish media from a public https URL. ' +
          'Upload the file to the assets service first.'
      );
    }
    return url;
  }

  private isPublicUrl(url: string): boolean {
    try {
      const { protocol, hostname } = new URL(url);
      if (protocol !== 'https:') {
        return false;
      }
      return !['localhost', '127.0.0.1', '::1'].includes(hostname);
    } catch {
      return false;
    }
  }

  /**
   * Only hand Meta a scheduled time it will accept. Anything outside the
   * 10-minute–30-day window publishes immediately, which is the correct
   * behaviour here because the cron only invokes this once the time has arrived.
   */
  private facebookScheduleTime(payload: SocialMediaPostPayload): number | undefined {
    const scheduledAt = payload.scheduling?.scheduled_publish_time;
    if (!scheduledAt || payload.scheduling?.publish_immediately) {
      return undefined;
    }

    const leadSeconds = scheduledAt - Math.floor(Date.now() / 1000);
    if (
      leadSeconds < FACEBOOK_MIN_SCHEDULE_LEAD_SECONDS ||
      leadSeconds > FACEBOOK_MAX_SCHEDULE_LEAD_SECONDS
    ) {
      return undefined;
    }

    return scheduledAt;
  }

  private scheduleFields(scheduledAt?: number): {
    published?: boolean;
    scheduled_publish_time?: number;
  } {
    return scheduledAt ? { published: false, scheduled_publish_time: scheduledAt } : {};
  }
}

export const metaPayloadTransformer = new MetaPayloadTransformer();
