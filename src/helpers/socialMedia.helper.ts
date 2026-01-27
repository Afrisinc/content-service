/**
 * Social Media Helper Functions
 * Provides utility functions for social media posting and platform integration
 */

import {
  SocialMediaPlatform,
  FacebookPostPayload,
  SocialMediaPostPayload,
  SocialMediaPostResult,
} from '@/types/socialMedia.types';
import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';

class SocialMediaHelper {
  private httpClient: AxiosInstance;
  private readonly FACEBOOK_API_VERSION = 'v24.0';
  private readonly FACEBOOK_GRAPH_API_URL = 'https://graph.facebook.com';

  constructor() {
    this.httpClient = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
  }

  /**
   * Transform generic social media payload to platform-specific payload
   */
  transformPayload(payload: SocialMediaPostPayload): FacebookPostPayload {
    const facebookPayload: FacebookPostPayload = {
      access_token: payload.accessToken,
      message: payload.content.message,
      link: payload.content.link,
      description: payload.content.description,
      picture: payload.content.picture,
      name: payload.content.name,
      caption: payload.content.caption,
    };

    // Add tags if present
    if (payload.content.tags && payload.content.tags.length > 0) {
      facebookPayload.story = payload.content.tags.join(' ');
    }

    // Add media information
    if (payload.media) {
      if (payload.media.type === 'image' && payload.media.url) {
        facebookPayload.picture = payload.media.url;
      } else if (payload.media.type === 'video' && payload.media.url) {
        facebookPayload.source = payload.media.url;
      }
    }

    // Add scheduling
    if (payload.scheduling?.scheduled_publish_time) {
      facebookPayload.scheduled_publish_time = payload.scheduling.scheduled_publish_time;
    }

    // Add targeting if present
    if (payload.targeting) {
      facebookPayload.targeting = payload.targeting;
    }

    return facebookPayload;
  }

  /**
   * Build Facebook Graph API URL for posting
   */
  buildFacebookApiUrl(pageId: string): string {
    return `${this.FACEBOOK_GRAPH_API_URL}/${this.FACEBOOK_API_VERSION}/${pageId}/feed`;
  }

  /**
   * Convert payload to URL-encoded form data
   */
  payloadToFormData(payload: any): string {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null) {
        if (typeof value === 'object') {
          params.append(key, JSON.stringify(value));
        } else {
          params.append(key, String(value));
        }
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

    if (!payload.pageId) {
      errors.push('pageId is required');
    }

    if (!payload.accessToken) {
      errors.push('accessToken is required');
    }

    if (!payload.content) {
      errors.push('content object is required');
    } else {
      const { message, link, picture } = payload.content;
      if (!message && !link && !picture) {
        errors.push('At least one of message, link, or picture must be provided');
      }
    }

    if (payload.platform !== SocialMediaPlatform.FACEBOOK) {
      // Currently only Facebook is fully implemented
      // Other platforms can be added later
      errors.push(`Platform ${payload.platform} is not yet supported`);
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
    const errorMessage = error.response?.data?.error?.message || error.message || 'Unknown error occurred';
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
  buildAIMetadata(aiConfig?: { enabled: boolean; provider?: string; model?: string; prompt?: string }): any {
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
