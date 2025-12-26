/**
 * Social Media Service
 * Handles business logic for social media posting operations
 */

import {
  SocialMediaPlatform,
  SocialMediaPostPayload,
  SocialMediaPostResult,
} from '@/types/socialMedia.types';
import { socialMediaHelper } from '@/helpers/socialMedia.helper';
import { socialMediaPostRepository } from '@/repositories/socialMediaPost.repository';
import { logger } from '@/utils/logger';

export class SocialMediaService {
  /**
   * Post content to social media platform and save to database
   */
  async postToSocialMedia(
    payload: SocialMediaPostPayload,
    userId?: string
  ): Promise<SocialMediaPostResult> {
    let dbPostId: string | undefined;

    try {
      // Validate payload
      const validation = socialMediaHelper.validatePayload(payload);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Additional format validation
      if (!socialMediaHelper.isValidAccessToken(payload.accessToken)) {
        throw new Error('Invalid access token format');
      }

      if (!socialMediaHelper.isValidPageId(payload.pageId)) {
        throw new Error('Invalid page ID format');
      }

      // Sanitize content
      const sanitizedContent = socialMediaHelper.sanitizeContent(
        payload.content
      );
      const sanitizedPayload = { ...payload, content: sanitizedContent };

      // Check content limits
      const contentCheck = socialMediaHelper.checkContentLimits(
        sanitizedPayload.content,
        payload.platform
      );
      if (!contentCheck.valid) {
        logger.warn(
          {
            warnings: contentCheck.warnings,
            platform: payload.platform,
          },
          'Content limit warnings'
        );
      }

      // Save to database if userId is provided
      if (userId) {
        const dbPost = await socialMediaPostRepository.createPost({
          userId,
          platform: payload.platform,
          pageId: payload.pageId,
          message: sanitizedPayload.content.message,
          link: sanitizedPayload.content.link,
          description: sanitizedPayload.content.description,
          picture: sanitizedPayload.content.picture,
          name: sanitizedPayload.content.name,
          caption: sanitizedPayload.content.caption,
          tags: sanitizedPayload.content.tags,
          mediaType: sanitizedPayload.media?.type,
          mediaUrls:
            sanitizedPayload.media?.urls ||
            (sanitizedPayload.media?.url ? [sanitizedPayload.media.url] : []),
          altText: sanitizedPayload.media?.alt_text,
          scheduledAt: sanitizedPayload.scheduling?.scheduled_publish_time
            ? new Date(
                sanitizedPayload.scheduling.scheduled_publish_time * 1000
              )
            : undefined,
          ageMin: sanitizedPayload.targeting?.age_min,
          ageMax: sanitizedPayload.targeting?.age_max,
          genders: sanitizedPayload.targeting?.genders || [],
          countries: sanitizedPayload.targeting?.countries || [],
          regions: sanitizedPayload.targeting?.regions || [],
          cities: sanitizedPayload.targeting?.cities || [],
          interests: sanitizedPayload.targeting?.interests || [],
          keywords: sanitizedPayload.targeting?.keywords || [],
          aiGenerated: sanitizedPayload.metadata?.aiGenerated,
          aiProvider: sanitizedPayload.metadata?.generatedBy,
          aiPrompt: sanitizedPayload.metadata?.generationPrompt,
          status: 'pending',
          metadata: sanitizedPayload.metadata
            ? JSON.stringify(sanitizedPayload.metadata)
            : undefined,
        });

        dbPostId = dbPost.id;
        logger.info(
          { dbPostId, platform: payload.platform },
          'Post saved to database'
        );
      }

      // Log attempt
      const contentLength = socialMediaHelper.estimateContentLength(
        sanitizedPayload.content
      );
      socialMediaHelper.logPostAttempt(
        payload.platform,
        payload.pageId,
        contentLength
      );

      // Route to appropriate platform handler
      let result: SocialMediaPostResult;

      switch (payload.platform) {
        case SocialMediaPlatform.FACEBOOK:
          result = await this.postToFacebook(sanitizedPayload);
          break;

        case SocialMediaPlatform.INSTAGRAM:
          result = await this.postToInstagram();
          break;

        case SocialMediaPlatform.TWITTER:
          result = await this.postToTwitter();
          break;

        case SocialMediaPlatform.LINKEDIN:
          result = await this.postToLinkedIn();
          break;

        case SocialMediaPlatform.TIKTOK:
          result = await this.postToTikTok();
          break;

        default:
          throw new Error(`Unsupported platform: ${payload.platform}`);
      }

      // Update database with success
      if (dbPostId && result.status === 'success') {
        await socialMediaPostRepository.updatePostAfterPublish(dbPostId, {
          platformPostId: result.postId,
          postUrl: result.metadata?.permalink_url,
          publishedAt: new Date(),
          status: 'published',
        });
      }

      // Log success
      socialMediaHelper.logPostSuccess(
        payload.platform,
        result.postId,
        payload.pageId
      );

      return result;
    } catch (error) {
      const platform = payload?.platform || SocialMediaPlatform.FACEBOOK;
      const pageId = payload?.pageId || 'unknown';
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Mark post as failed in database
      if (dbPostId) {
        await socialMediaPostRepository.markPostFailed(dbPostId, errorMessage);
      }

      socialMediaHelper.logPostFailure(platform, pageId, errorMessage);

      return socialMediaHelper.buildErrorResult(platform, error);
    }
  }

  /**
   * Post to Facebook
   */
  private async postToFacebook(
    payload: SocialMediaPostPayload
  ): Promise<SocialMediaPostResult> {
    // Transform payload to Facebook-specific format
    const facebookPayload = socialMediaHelper.transformPayload(payload);

    // Build API URL
    const apiUrl = socialMediaHelper.buildFacebookApiUrl(payload.pageId);

    // Convert to form data
    const formData = socialMediaHelper.payloadToFormData(facebookPayload);

    // Make API request using native fetch
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    const responseData = (await response.json()) as any;

    if (!response.ok) {
      throw new Error(
        responseData.error?.message || `Facebook API error: ${response.status}`
      );
    }

    // Parse response
    const result = socialMediaHelper.parseFacebookResponse({
      data: responseData,
    });

    // Add metadata if present
    if (payload.metadata) {
      result.metadata = {
        ...result.metadata,
        ...payload.metadata,
      };
    }

    return result;
  }

  /**
   * Post to Instagram (via Facebook Graph API)
   */
  private async postToInstagram(): Promise<SocialMediaPostResult> {
    // Instagram uses Facebook Graph API but with different endpoints
    // This is a placeholder for Instagram implementation
    logger.warn('Instagram posting is not yet fully implemented');

    return {
      platform: SocialMediaPlatform.INSTAGRAM,
      postId: '',
      status: 'pending',
      message: 'Instagram posting will be available soon',
    };
  }

  /**
   * Post to Twitter
   */
  private async postToTwitter(): Promise<SocialMediaPostResult> {
    // This is a placeholder for Twitter implementation
    logger.warn('Twitter posting is not yet implemented');

    return {
      platform: SocialMediaPlatform.TWITTER,
      postId: '',
      status: 'pending',
      message: 'Twitter posting will be available soon',
    };
  }

  /**
   * Post to LinkedIn
   */
  private async postToLinkedIn(): Promise<SocialMediaPostResult> {
    // This is a placeholder for LinkedIn implementation
    logger.warn('LinkedIn posting is not yet implemented');

    return {
      platform: SocialMediaPlatform.LINKEDIN,
      postId: '',
      status: 'pending',
      message: 'LinkedIn posting will be available soon',
    };
  }

  /**
   * Post to TikTok
   */
  private async postToTikTok(): Promise<SocialMediaPostResult> {
    // This is a placeholder for TikTok implementation
    logger.warn('TikTok posting is not yet implemented');

    return {
      platform: SocialMediaPlatform.TIKTOK,
      postId: '',
      status: 'pending',
      message: 'TikTok posting will be available soon',
    };
  }

  /**
   * Get post details from Facebook
   */
  async getPostDetails(postId: string, accessToken: string): Promise<any> {
    try {
      const url = `https://graph.facebook.com/v24.0/${postId}?access_token=${accessToken}&fields=id,message,story,picture,link,name,description,type,status_type,permalink_url,shares,likes.summary(true).limit(0),comments.summary(true).limit(0),created_time,updated_time`;

      const response = await fetch(url, {
        method: 'GET',
      });

      const data = (await response.json()) as any;

      if (!response.ok) {
        throw new Error(
          data.error?.message || `Facebook API error: ${response.status}`
        );
      }

      return data;
    } catch (error) {
      logger.error(
        {
          postId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to get post details'
      );
      throw error;
    }
  }

  /**
   * Delete post from social media and database
   */
  async deletePost(
    postId: string,
    accessToken: string,
    platform: SocialMediaPlatform,
    dbPostId?: string
  ): Promise<boolean> {
    try {
      if (platform !== SocialMediaPlatform.FACEBOOK) {
        throw new Error(`Delete not yet supported for ${platform}`);
      }

      const url = `https://graph.facebook.com/v24.0/${postId}?access_token=${accessToken}`;

      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = (await response.json()) as any;
        throw new Error(
          data.error?.message || `Facebook API error: ${response.status}`
        );
      }

      // Mark as deleted in database
      if (dbPostId) {
        await socialMediaPostRepository.deletePost(dbPostId);
      }

      logger.info(
        {
          postId,
          platform,
        },
        'Successfully deleted post'
      );

      return true;
    } catch (error) {
      logger.error(
        {
          postId,
          platform,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to delete post'
      );
      throw error;
    }
  }

  /**
   * Batch post to multiple platforms
   */
  async batchPostToSocialMedia(
    payloads: SocialMediaPostPayload[],
    userId?: string
  ): Promise<SocialMediaPostResult[]> {
    try {
      const promises = payloads.map(payload =>
        this.postToSocialMedia(payload, userId)
      );
      const results = await Promise.allSettled(promises);

      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          const payload = payloads[index];
          return socialMediaHelper.buildErrorResult(
            payload.platform,
            result.reason
          );
        }
      });
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Batch posting failed'
      );
      throw error;
    }
  }

  /**
   * Get user's post history
   */
  async getUserPosts(
    userId: string,
    filters?: {
      platform?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    return socialMediaPostRepository.getPostsByUser(userId, filters);
  }

  /**
   * Get user's statistics
   */
  async getUserStats(userId: string) {
    return socialMediaPostRepository.getUserPostStats(userId);
  }
}

export const socialMediaService = new SocialMediaService();
