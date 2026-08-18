/**
 * Social Media Helper Functions
 * Provides utility functions for social media posting and platform integration
 */

import {
  SocialMediaPlatform,
  FacebookPostPayload,
  SocialMediaPostPayload,
  SocialMediaPostResult,
  SocialPostFormat,
} from '@/types/socialMedia.types';
import { logger } from '@/utils/logger';

/** Platforms with a working publish path. Twitter/LinkedIn/TikTok are stubs. */
const PUBLISHABLE_PLATFORMS = new Set<SocialMediaPlatform>([
  SocialMediaPlatform.FACEBOOK,
  SocialMediaPlatform.INSTAGRAM,
]);

class SocialMediaHelper {
  private readonly FACEBOOK_API_VERSION = 'v24.0';
  private readonly FACEBOOK_GRAPH_API_URL = 'https://graph.facebook.com';

  /**
   * Transform generic social media payload to platform-specific payload
   * Note: When posting to external URLs (with link field), Facebook API restrictions prevent
   * setting picture, name, and description metadata. This method automatically excludes
   * these fields to prevent API errors (#100).
   */
  transformPayload(payload: SocialMediaPostPayload): FacebookPostPayload {
    const facebookPayload: FacebookPostPayload = {
      access_token: payload.accessToken,
    };

    // Check if posting to external URL - Facebook has restrictions on metadata fields
    const isExternalUrlPost = !!payload.content.link;

    // Add content fields - only valid Facebook fields
    if (payload.content.message) {
      facebookPayload.message = payload.content.message;
    }
    if (payload.content.link) {
      facebookPayload.link = payload.content.link;
    }

    // Only add metadata fields if NOT posting to external URL (Facebook restriction #100)
    if (!isExternalUrlPost) {
      if (payload.content.description) {
        facebookPayload.description = payload.content.description;
      }
      if (payload.content.name) {
        facebookPayload.name = payload.content.name;
      }

      // Handle picture - prefer media.url if provided for images, otherwise use content.picture
      let pictureUrl = payload.content.picture;
      if (payload.media?.type === 'image' && payload.media?.url) {
        pictureUrl = payload.media.url;
      }
      if (pictureUrl) {
        facebookPayload.picture = pictureUrl;
      }
    }

    // Handle video - use media.url for videos (not affected by external URL restriction)
    if (payload.media?.type === 'video' && payload.media?.url) {
      facebookPayload.source = payload.media.url;
    }

    // Add tags to message if present (Facebook doesn't have separate tags field for feed posts)
    if (payload.content.tags && payload.content.tags.length > 0) {
      const tagString = payload.content.tags.map(tag => `#${tag}`).join(' ');
      if (facebookPayload.message) {
        facebookPayload.message = `${facebookPayload.message}\n\n${tagString}`;
      } else {
        facebookPayload.message = tagString;
      }
    }

    // Handle scheduling - Facebook doesn't allow scheduling with external links (restriction #100)
    // Only add scheduled_publish_time if NOT posting to external URL
    if (payload.scheduling?.scheduled_publish_time && !isExternalUrlPost) {
      facebookPayload.scheduled_publish_time = payload.scheduling.scheduled_publish_time;
    }

    return facebookPayload;
  }

  /**
   * Build Facebook Graph API URL for posting
   * Requests permalink_url in response so we get the actual post URL
   */
  buildFacebookApiUrl(pageId: string): string {
    return `${this.FACEBOOK_GRAPH_API_URL}/${this.FACEBOOK_API_VERSION}/${pageId}/feed?fields=id,permalink_url`;
  }

  /**
   * Convert payload to URL-encoded form data
   * Only includes scalar values (strings, numbers, booleans)
   * Objects and arrays are excluded as Facebook doesn't accept them in form data
   */
  payloadToFormData(payload: any): string {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(payload)) {
      // Skip undefined, null, empty arrays, and objects
      if (value !== undefined && value !== null && value !== '') {
        // Only add scalar values - skip objects and arrays
        if (typeof value !== 'object') {
          params.append(key, String(value));
        }
        // If it's an array, add each element individually (for multi-value params)
        else if (Array.isArray(value) && value.length > 0) {
          value.forEach(item => {
            if (typeof item === 'object') {
              params.append(key + '[]', JSON.stringify(item));
            } else {
              params.append(key + '[]', String(item));
            }
          });
        }
        // Skip plain objects - Facebook doesn't accept them in feed posts
      }
    }

    return params.toString();
  }

  /**
   * Validate payload has required fields
   */
  validatePayload(payload: SocialMediaPostPayload): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!payload.platform) {
      errors.push('platform is required');
    }

    if (!payload.pageId) {
      errors.push('pageId is required');
    }

    const hasMedia = !!(payload.media?.url || payload.media?.urls?.length);

    if (!payload.content) {
      errors.push('content object is required');
    } else {
      const { message, link, picture } = payload.content;
      if (!message && !link && !picture && !hasMedia) {
        errors.push('At least one of message, link, picture, or media must be provided');
      }
    }

    if (payload.format === SocialPostFormat.STORY && !hasMedia) {
      errors.push('A story requires an image or a video');
    }

    if (payload.format === SocialPostFormat.REEL && !hasMedia) {
      errors.push('A reel requires a video');
    }

    if (payload.format === SocialPostFormat.STORY && payload.media?.type === 'carousel') {
      errors.push('Stories take a single image or video, not a carousel');
    }

    if (payload.format === SocialPostFormat.REEL && payload.media?.type === 'carousel') {
      errors.push('Reels take a single video, not a carousel');
    }

    if (payload.platform && !PUBLISHABLE_PLATFORMS.has(payload.platform)) {
      errors.push(`Platform ${payload.platform} is not yet supported`);
    }

    // Instagram has no text-only post type; the Graph API rejects a container
    // with no image_url or video_url.
    if (payload.platform === SocialMediaPlatform.INSTAGRAM && !hasMedia) {
      errors.push('Instagram posts require an image or video');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse Facebook API response
   */
  parseFacebookResponse(response: any): SocialMediaPostResult {
    return {
      platform: SocialMediaPlatform.FACEBOOK,
      postId: response.data.id || '',
      status: 'success',
      message: 'Post published successfully',
      publishedAt: new Date().toISOString(),
      metadata: response.data,
    };
  }

  /**
   * Build error result
   */
  buildErrorResult(platform: SocialMediaPlatform, error: any): SocialMediaPostResult {
    const errorMessage =
      error.response?.data?.error?.message || error.message || 'Unknown error occurred';
    const errorCode = error.response?.data?.error?.code || error.response?.status;

    return {
      platform,
      postId: '',
      status: 'failed',
      message: 'Failed to publish post',
      error: `${errorMessage}${errorCode ? ` (Error Code: ${errorCode})` : ''}`,
    };
  }

  /**
   * Validate access token format
   */
  isValidAccessToken(token: string): boolean {
    return token.length > 0 && /^[a-zA-Z0-9_-]+$/.test(token);
  }

  /**
   * Validate page ID format
   */
  isValidPageId(pageId: string): boolean {
    return /^\d+$/.test(pageId);
  }

  /**
   * Build metadata for AI-generated content
   */
  buildAIMetadata(aiConfig?: {
    enabled: boolean;
    provider?: string;
    model?: string;
    prompt?: string;
  }): any {
    if (!aiConfig?.enabled) {
      return null;
    }

    return {
      aiGenerated: true,
      generatedBy: aiConfig.provider || 'unknown',
      model: aiConfig.model,
      generationPrompt: aiConfig.prompt,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Estimate content character count for platform limits
   */
  estimateContentLength(content: SocialMediaPostPayload['content']): number {
    let length = 0;

    if (content.message) {
      length += content.message.length;
    }
    if (content.caption) {
      length += content.caption.length;
    }
    if (content.description) {
      length += content.description.length;
    }

    return length;
  }

  /**
   * Check if content exceeds platform limits
   */
  checkContentLimits(
    content: SocialMediaPostPayload['content'],
    platform: SocialMediaPlatform
  ): {
    valid: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const length = this.estimateContentLength(content);

    switch (platform) {
      case SocialMediaPlatform.FACEBOOK:
        if (content.message && content.message.length > 63206) {
          warnings.push(`Message exceeds Facebook limit of 63206 characters`);
        }
        if (content.description && content.description.length > 4000) {
          warnings.push(`Description exceeds Facebook limit of 4000 characters`);
        }
        break;

      case SocialMediaPlatform.TWITTER:
        if (length > 280) {
          warnings.push(`Content exceeds Twitter limit of 280 characters`);
        }
        break;

      case SocialMediaPlatform.INSTAGRAM:
        if (content.caption && content.caption.length > 2200) {
          warnings.push(`Caption exceeds Instagram limit of 2200 characters`);
        }
        break;
    }

    return {
      valid: warnings.length === 0,
      warnings,
    };
  }

  /**
   * Sanitize content to prevent issues
   */
  sanitizeContent(content: SocialMediaPostPayload['content']): SocialMediaPostPayload['content'] {
    return {
      ...content,
      message: content.message?.trim(),
      description: content.description?.trim(),
      caption: content.caption?.trim(),
      name: content.name?.trim(),
    };
  }

  /**
   * Get platform-specific API endpoint
   */
  getApiEndpoint(platform: SocialMediaPlatform, pageId: string): string {
    switch (platform) {
      case SocialMediaPlatform.FACEBOOK:
        return this.buildFacebookApiUrl(pageId);

      case SocialMediaPlatform.INSTAGRAM:
        // Instagram API endpoint would be different
        return `${this.FACEBOOK_GRAPH_API_URL}/${this.FACEBOOK_API_VERSION}/${pageId}/ig_hashtag_search`;

      case SocialMediaPlatform.TWITTER:
        // Twitter API endpoints
        return 'https://api.twitter.com/2/tweets';

      case SocialMediaPlatform.LINKEDIN:
        // LinkedIn API endpoints
        return 'https://api.linkedin.com/v2/ugcPosts';

      case SocialMediaPlatform.TIKTOK:
        // TikTok API endpoints
        return 'https://open.tiktok.com/v1/post/publish/';

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Log post attempt for debugging
   */
  logPostAttempt(platform: SocialMediaPlatform, pageId: string, contentLength: number): void {
    logger.info(
      {
        platform,
        pageId,
        contentLength,
      },
      'Attempting to post to social media'
    );
  }

  /**
   * Log post success
   */
  logPostSuccess(platform: SocialMediaPlatform, postId: string, pageId: string): void {
    logger.info(
      {
        platform,
        postId,
        pageId,
      },
      'Successfully posted to social media'
    );
  }

  /**
   * Log post failure
   */
  logPostFailure(platform: SocialMediaPlatform, pageId: string, error: string): void {
    logger.error(
      {
        platform,
        pageId,
        error,
      },
      'Failed to post to social media'
    );
  }
}

export const socialMediaHelper = new SocialMediaHelper();
