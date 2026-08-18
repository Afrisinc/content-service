/** Media cannot ride on /feed: photos go to /photos, videos to /videos. */

import { SocialMediaPostPayload, SocialPostFormat } from '@/types/socialMedia.types';
import { logger } from '@/utils/logger';
import { DownloadedMedia, mediaDownloader } from './mediaDownloader';
import {
  FACEBOOK_MESSAGE_MAX_LENGTH,
  FACEBOOK_REEL_DESCRIPTION_MAX_LENGTH,
  INSTAGRAM_CAPTION_MAX_LENGTH,
  InstagramContainerRequest,
  InstagramPost,
  META_CAROUSEL_LIMITS,
  MetaBinaryMedia,
  MetaFacebookPost,
  MetaFeedRequest,
  MetaMediaSource,
  MetaPlatform,
  MetaPostKind,
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

/** video_reels caps scheduling far tighter than /feed does. */
const FACEBOOK_REEL_MAX_SCHEDULE_LEAD_SECONDS = 29 * 24 * 60 * 60;

export class MetaPayloadTransformer {
  async transformForFacebook(payload: SocialMediaPostPayload): Promise<MetaFacebookPost> {
    const format = payload.format ?? SocialPostFormat.FEED;

    if (format === SocialPostFormat.REEL) {
      return this.transformFacebookReel(payload);
    }

    if (format === SocialPostFormat.STORY) {
      return this.transformFacebookStory(payload);
    }

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

  private async transformFacebookReel(payload: SocialMediaPostPayload): Promise<MetaFacebookPost> {
    const videoUrl = this.storyOrReelVideoUrl(payload);
    if (!videoUrl) {
      throw new Error('A Facebook reel requires a video');
    }

    const description = this.buildBody(payload, FACEBOOK_REEL_DESCRIPTION_MAX_LENGTH, {
      disclose: !!payload.metadata?.aiGenerated,
    });
    const scheduledAt = this.scheduleTime(payload, FACEBOOK_REEL_MAX_SCHEDULE_LEAD_SECONDS);
    const source = await this.resolveMedia(videoUrl, 'video');

    return {
      kind: MetaPostKind.REEL,
      videoUpload: {
        access_token: payload.accessToken,
        fileUrl: source.url,
        binary: source.binary,
        description: description || undefined,
        title: payload.content.name || undefined,
        scheduledPublishTime: scheduledAt,
      },
    };
  }

  private async transformFacebookStory(payload: SocialMediaPostPayload): Promise<MetaFacebookPost> {
    const videoUrl = this.storyOrReelVideoUrl(payload);

    if (videoUrl) {
      const source = await this.resolveMedia(videoUrl, 'video');
      return {
        kind: MetaPostKind.VIDEO_STORY,
        videoUpload: {
          access_token: payload.accessToken,
          fileUrl: source.url,
          binary: source.binary,
        },
      };
    }

    const imageUrls = this.imageUrls(payload);
    if (imageUrls.length === 0) {
      throw new Error('A Facebook story requires an image or a video');
    }

    const source = await this.resolveMedia(imageUrls[0], 'image');

    return {
      kind: MetaPostKind.PHOTO_STORY,
      photo: {
        access_token: payload.accessToken,
        url: source.url,
        alt_text_custom: payload.media?.alt_text || undefined,
        published: false,
      },
      binary: source.binary,
    };
  }

  /**
   * Instagram only ever fetches media from a public URL — there is no binary
   * upload path — so unreachable media fails here rather than publishing as
   * text.
   */
  async transformForInstagram(payload: SocialMediaPostPayload): Promise<InstagramPost> {
    const caption = this.buildBody(payload, INSTAGRAM_CAPTION_MAX_LENGTH, { disclose: false });
    const isAiGenerated = payload.metadata?.aiGenerated || undefined;
    const format = payload.format ?? SocialPostFormat.FEED;
    const imageUrls = this.imageUrls(payload);

    if (format === SocialPostFormat.STORY) {
      return this.transformInstagramStory(payload, imageUrls, isAiGenerated);
    }

    const videoUrl =
      format === SocialPostFormat.REEL ? this.storyOrReelVideoUrl(payload) : this.videoUrl(payload);

    if (format === SocialPostFormat.REEL && !videoUrl) {
      throw new Error('An Instagram reel requires a video');
    }

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

  private transformInstagramStory(
    payload: SocialMediaPostPayload,
    imageUrls: string[],
    isAiGenerated?: boolean
  ): InstagramPost {
    const videoUrl = this.storyOrReelVideoUrl(payload);

    if (videoUrl) {
      return {
        container: {
          access_token: payload.accessToken,
          media_type: 'STORIES',
          video_url: this.requirePublicUrl(videoUrl),
          is_ai_generated: isAiGenerated,
        },
      };
    }

    if (imageUrls.length === 0) {
      throw new Error('An Instagram story requires an image or a video');
    }

    return {
      container: {
        access_token: payload.accessToken,
        media_type: 'STORIES',
        image_url: this.requirePublicUrl(imageUrls[0]),
        is_ai_generated: isAiGenerated,
      },
    };
  }

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

  private storyOrReelVideoUrl(payload: SocialMediaPostPayload): string | undefined {
    const media = payload.media;
    if (!media) {
      return undefined;
    }
    if (media.type === 'video') {
      return media.url || media.urls?.[0];
    }
    const candidate = media.url || media.urls?.[0];
    return candidate && this.looksLikeVideo(candidate) ? candidate : undefined;
  }

  private looksLikeVideo(url: string): boolean {
    return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(url);
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
   * A public https URL is handed over as-is so Meta fetches it directly rather
   * than streaming the bytes through this service. Anything Meta cannot fetch
   * (a data: URI, plain http) is downloaded and uploaded as multipart instead.
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

  /** Facebook only. Instagram has no multipart path. */
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
   * A time outside Meta's accepted window publishes immediately, which is
   * correct here — the cron only invokes this once the time has arrived, so by
   * then the timestamp is in the past.
   */
  private facebookScheduleTime(payload: SocialMediaPostPayload): number | undefined {
    return this.scheduleTime(payload, FACEBOOK_MAX_SCHEDULE_LEAD_SECONDS);
  }

  private scheduleTime(
    payload: SocialMediaPostPayload,
    maxLeadSeconds: number
  ): number | undefined {
    const scheduledAt = payload.scheduling?.scheduled_publish_time;
    if (!scheduledAt || payload.scheduling?.publish_immediately) {
      return undefined;
    }

    const leadSeconds = scheduledAt - Math.floor(Date.now() / 1000);
    if (leadSeconds < FACEBOOK_MIN_SCHEDULE_LEAD_SECONDS || leadSeconds > maxLeadSeconds) {
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
