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
import { socialMediaAccountRepository } from '@/repositories/socialMediaAccount.repository';
import { decryptToken, encryptToken } from '@/utils/oauthToken';
import { logger } from '@/utils/logger';
import { getAssetsClient } from '@/utils/assets-client';
import { metaClient } from '@/adapters/meta/metaClient';
import { metaPayloadTransformer } from '@/adapters/meta/metaPayloadTransformer';
import {
  MetaPlatform,
  MetaPostKind,
  MetaBinaryMedia,
  MetaFacebookPost,
  MetaFeedRequest,
  MetaMediaSource,
  MetaPhotoRequest,
  MetaPostResponse,
  MetaVideoRequest,
  InstagramPost,
} from '@/adapters/meta/meta.types';

export class SocialMediaService {
  /**
   * Process media URLs - convert base64 images to CDN URLs via Assets API
   * Throws error if ANY image fails to upload
   */
  private async processMediaUrls(urls?: string[]): Promise<string[] | undefined> {
    if (!urls || urls.length === 0) {
      return undefined;
    }

    const processedUrls = await Promise.all(
      urls.map(async url => {
        // If already a URL (http/https), return as-is
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }

        // If base64 data URL, extract and upload to Assets API
        if (url.startsWith('data:')) {
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (!match) {
            logger.warn({}, 'Invalid base64 image format, keeping original');
            return url;
          }

          const [, , base64Data] = match;
          const buffer = Buffer.from(base64Data, 'base64');
          const folderId = (global as any).SOCIAL_MEDIA_FOLDER_ID;

          if (!folderId) {
            logger.warn(
              { bufferSize: buffer.length },
              'Assets folder not initialized - keeping base64 image'
            );
            return url;
          }

          const assetsClient = getAssetsClient();
          let lastError: Error | null = null;
          const MAX_RETRIES = 3;

          // Retry logic for resilience
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              const asset = await assetsClient.uploadBuffer(buffer, `image-${Date.now()}.jpg`, {
                folderId,
                tags: ['social-media', 'post-image'],
              });

              logger.debug(
                { assetId: asset.id, assetUrl: asset.url, attempt },
                'Successfully uploaded base64 image to Assets'
              );
              return asset.url;
            } catch (error) {
              lastError = error instanceof Error ? error : new Error(String(error));
              logger.warn(
                {
                  attempt,
                  maxRetries: MAX_RETRIES,
                  error: lastError.message,
                },
                `Image upload attempt ${attempt}/${MAX_RETRIES} failed`
              );

              if (attempt < MAX_RETRIES) {
                // Exponential backoff: 100ms, 200ms, 400ms
                await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
              }
            }
          }

          // All retries exhausted - throw error
          const errorMsg = lastError?.message || 'Unknown error';
          throw new Error(`Failed to upload image after ${MAX_RETRIES} attempts: ${errorMsg}`);
        }

        return url;
      })
    );

    return processedUrls;
  }

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

      if (!socialMediaHelper.isValidPageId(payload.pageId)) {
        throw new Error('Invalid page ID format');
      }

      // Fetch access token from database using platform + pageId
      const storedAccount = await this.getStoredAccountToken(payload.platform, payload.pageId);
      if (!storedAccount || !storedAccount.accessToken) {
        throw new Error(
          `No connected account found for ${payload.platform} page ${payload.pageId}. Please connect the account first.`
        );
      }

      // Use stored token instead of payload token
      payload.accessToken = storedAccount.accessToken;

      // Sanitize content
      const sanitizedContent = socialMediaHelper.sanitizeContent(payload.content);
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
        // Encrypt token for secure storage in database
        const encryptedToken = encryptToken(payload.accessToken);

        // Process media URLs (convert base64 to CDN URLs)
        const rawMediaUrls =
          sanitizedPayload.media?.urls ||
          (sanitizedPayload.media?.url ? [sanitizedPayload.media.url] : []);
        const processedMediaUrls = await this.processMediaUrls(rawMediaUrls);

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
          mediaUrls: processedMediaUrls || [],
          altText: sanitizedPayload.media?.alt_text,
          scheduledAt: sanitizedPayload.scheduling?.scheduled_publish_time
            ? new Date(sanitizedPayload.scheduling.scheduled_publish_time * 1000)
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
          accessTokenEnc: encryptedToken,
          metadata: sanitizedPayload.metadata
            ? JSON.stringify(sanitizedPayload.metadata)
            : undefined,
        });

        dbPostId = dbPost.id;
        logger.info({ dbPostId, platform: payload.platform }, 'Post saved to database');
      }

      // Post is now saved to database with status "pending"
      // Facebook API call will be handled by a cron job
      logger.info(
        { dbPostId, platform: payload.platform, pageId: payload.pageId },
        'Post saved to queue for processing'
      );

      // Return success - post is queued for processing
      return {
        platform: payload.platform,
        postId: dbPostId || 'queued',
        status: 'pending' as const,
        message: 'Post queued for processing. Will be published by scheduled job.',
      };
    } catch (error) {
      const platform = payload?.platform || SocialMediaPlatform.FACEBOOK;
      const pageId = payload?.pageId || 'unknown';
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error({ dbPostId, platform, pageId, error: errorMessage }, 'Failed to queue post');

      throw error;
    }
  }

  /**
   * Publish to a Facebook Page.
   *
   * The transformer decides which edge renders the post; media never goes
   * through /feed, so a photo, an album and a plain text post are three
   * different calls here.
   */
  private async postToFacebook(payload: SocialMediaPostPayload): Promise<SocialMediaPostResult> {
    try {
      this.assertCarouselWithinLimits(payload, MetaPlatform.FACEBOOK);

      const post = await metaPayloadTransformer.transformForFacebook(payload);
      const response = await this.executeFacebookPost(payload.pageId, post);

      // /photos and /videos return the media id in `id` and the feed post in `post_id`.
      const postId = response.post_id || response.id;
      const permalink =
        response.permalink_url || (await metaClient.getPermalink(postId, payload.accessToken));

      logger.info({ postId, kind: post.kind, pageId: payload.pageId }, 'Facebook post published');

      return {
        platform: SocialMediaPlatform.FACEBOOK,
        postId,
        status: 'success',
        message: 'Post published to Facebook',
        publishedAt: new Date().toISOString(),
        metadata: { ...response, permalink_url: permalink, kind: post.kind },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ pageId: payload.pageId, error: errorMsg }, 'Failed to post to Facebook');
      throw error;
    }
  }

  private async executeFacebookPost(
    pageId: string,
    post: MetaFacebookPost
  ): Promise<MetaPostResponse> {
    if (post.kind === MetaPostKind.PHOTO && post.photo) {
      return this.uploadPhotoResiliently(pageId, post.photo, post.binary);
    }

    if (post.kind === MetaPostKind.VIDEO && post.video) {
      return this.uploadVideoResiliently(pageId, post.video, post.binary);
    }

    if (post.kind === MetaPostKind.MULTI_PHOTO && post.feed) {
      return this.publishFacebookAlbum(pageId, post.feed, post.photos || []);
    }

    if (!post.feed) {
      throw new Error(`Transformed Facebook post of kind "${post.kind}" is missing its request`);
    }

    return metaClient.postToFeed(pageId, post.feed);
  }

  /**
   * Upload a photo, falling back to a raw byte upload if Meta cannot fetch the
   * URL itself.
   *
   * Handing Meta a URL is the fast path — it downloads the file directly rather
   * than streaming it through this service. But that only works when the host is
   * reachable from Meta's network, which a private or staging asset host is not,
   * and the failure is indistinguishable from a bad image until it comes back.
   * Facebook accepts a multipart file attachment as an alternative, so retry that
   * way rather than losing the post.
   */
  private async uploadPhotoResiliently(
    pageId: string,
    request: MetaPhotoRequest,
    binary?: MetaBinaryMedia
  ): Promise<MetaPostResponse> {
    try {
      return await metaClient.uploadPhoto(pageId, request, binary);
    } catch (error) {
      if (binary || !request.url || !this.isMediaFetchError(error)) {
        throw error;
      }

      logger.warn(
        { pageId, url: request.url },
        'Meta could not fetch the image URL, retrying as a direct byte upload'
      );

      const bytes = await metaPayloadTransformer.toBinary(request.url, 'image');
      return metaClient.uploadPhoto(pageId, { ...request, url: undefined }, bytes);
    }
  }

  private async uploadVideoResiliently(
    pageId: string,
    request: MetaVideoRequest,
    binary?: MetaBinaryMedia
  ): Promise<MetaPostResponse> {
    try {
      return await metaClient.uploadVideo(pageId, request, binary);
    } catch (error) {
      if (binary || !request.file_url || !this.isMediaFetchError(error)) {
        throw error;
      }

      logger.warn(
        { pageId, url: request.file_url },
        'Meta could not fetch the video URL, retrying as a direct byte upload'
      );

      const bytes = await metaPayloadTransformer.toBinary(request.file_url, 'video');
      return metaClient.uploadVideo(pageId, { ...request, file_url: undefined }, bytes);
    }
  }

  /**
   * Whether Meta failed because it could not retrieve the media, as opposed to
   * rejecting the request itself. Code 324 is the documented "missing or invalid
   * image file"; the rest are the phrasings Meta returns when the fetch fails.
   */
  private isMediaFetchError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

    return (
      message.includes('code 324') ||
      message.includes('invalid image file') ||
      message.includes('unable to fetch') ||
      message.includes('could not fetch') ||
      message.includes('unable to download') ||
      message.includes('failed to fetch')
    );
  }

  /**
   * Publish several photos as one post: upload each unpublished, then reference
   * the resulting ids from a single feed post. Promise.all preserves input
   * order, which is the order the images appear in.
   */
  private async publishFacebookAlbum(
    pageId: string,
    feed: MetaFeedRequest,
    sources: MetaMediaSource[]
  ): Promise<MetaPostResponse> {
    // A temporary upload is short-lived, so it is only safe when the feed post
    // goes out immediately — a scheduled album must keep its photos alive.
    const temporary = !feed.scheduled_publish_time;

    logger.info(
      { pageId, photoCount: sources.length, temporary },
      'Composing Facebook album: staging photos unpublished before attaching'
    );

    const uploads = await Promise.all(
      sources.map(source =>
        this.uploadPhotoResiliently(
          pageId,
          {
            access_token: feed.access_token,
            url: source.url,
            published: false,
            temporary,
            alt_text_custom: source.altText,
          },
          source.binary
        )
      )
    );

    const attached_media = uploads.map(upload => ({ media_fbid: upload.id }));

    logger.info(
      { pageId, mediaFbids: attached_media.map(item => item.media_fbid) },
      'Attaching staged photos to a single feed post'
    );

    return metaClient.postToFeed(pageId, { ...feed, attached_media });
  }

  /**
   * Publish to an Instagram Business account.
   *
   * Instagram is a three-step protocol: create a container, wait for Instagram
   * to finish processing the media, then publish the container. Carousels add a
   * round of child containers before the parent.
   */
  private async postToInstagram(payload: SocialMediaPostPayload): Promise<SocialMediaPostResult> {
    try {
      this.assertCarouselWithinLimits(payload, MetaPlatform.INSTAGRAM);

      const post = await metaPayloadTransformer.transformForInstagram(payload);
      const containerId = await this.createInstagramContainer(payload.pageId, post);

      await metaClient.waitForInstagramContainer(containerId, payload.accessToken);

      const response = await metaClient.publishInstagramContainer(
        payload.pageId,
        containerId,
        payload.accessToken
      );

      const permalink = await this.getInstagramPermalink(response.id, payload.accessToken);

      logger.info({ postId: response.id, accountId: payload.pageId }, 'Instagram post published');

      return {
        platform: SocialMediaPlatform.INSTAGRAM,
        postId: response.id,
        status: 'success',
        message: 'Post published to Instagram',
        publishedAt: new Date().toISOString(),
        metadata: { ...response, permalink_url: permalink },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ accountId: payload.pageId, error: errorMsg }, 'Failed to post to Instagram');
      throw error;
    }
  }

  /**
   * Build the container to publish. Carousel children must exist and have
   * finished processing before the parent container can reference them.
   */
  private async createInstagramContainer(igUserId: string, post: InstagramPost): Promise<string> {
    if (!post.childContainers?.length) {
      return metaClient.createInstagramContainer(igUserId, post.container);
    }

    const childIds = await Promise.all(
      post.childContainers.map(child => metaClient.createInstagramContainer(igUserId, child))
    );

    await Promise.all(
      childIds.map(childId =>
        metaClient.waitForInstagramContainer(childId, post.container.access_token)
      )
    );

    return metaClient.createInstagramContainer(igUserId, {
      ...post.container,
      children: childIds,
    });
  }

  /** The IG media node exposes its public link as `permalink`, not `permalink_url`. */
  private async getInstagramPermalink(
    mediaId: string,
    accessToken: string
  ): Promise<string | undefined> {
    try {
      const media = await metaClient.getPost(mediaId, accessToken, MetaPlatform.INSTAGRAM);
      return media.permalink || media.permalink_url;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ mediaId, error: errorMsg }, 'Could not fetch Instagram permalink');
      return undefined;
    }
  }

  private assertCarouselWithinLimits(
    payload: SocialMediaPostPayload,
    platform: MetaPlatform
  ): void {
    if (payload.media?.type !== 'carousel') {
      return;
    }

    const check = metaPayloadTransformer.validateCarousel(payload.media.urls, platform);
    if (!check.valid) {
      throw new Error(check.error);
    }
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
        throw new Error(data.error?.message || `Facebook API error: ${response.status}`);
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
        throw new Error(data.error?.message || `Facebook API error: ${response.status}`);
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
      const promises = payloads.map(payload => this.postToSocialMedia(payload, userId));
      const results = await Promise.allSettled(promises);

      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          const payload = payloads[index];
          return socialMediaHelper.buildErrorResult(payload.platform, result.reason);
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
   * Get all social media posts with optional filters
   */
  async getAllPosts(filters?: {
    platform?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    return socialMediaPostRepository.getAllPosts(filters);
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

  /**
   * Update a pending/scheduled post (only before publishing)
   */
  async updatePost(postId: string, userId: string, payload: Partial<SocialMediaPostPayload>) {
    // Fetch existing post
    const existingPost = await socialMediaPostRepository.findById(postId);

    if (!existingPost) {
      throw new Error(`Post not found: ${postId}`);
    }

    // Only allow updating pending posts
    if (existingPost.status !== 'pending') {
      throw new Error(
        `Cannot update post with status '${existingPost.status}'. Only pending posts can be updated.`
      );
    }

    // Verify ownership
    if (existingPost.userId !== userId) {
      throw new Error("Unauthorized: Cannot update another user's post");
    }

    // Process media URLs if provided
    let processedMediaUrls = existingPost.mediaUrls;
    if (payload.media?.urls) {
      processedMediaUrls = (await this.processMediaUrls(payload.media.urls)) || [];
    }

    // Update the post
    const updatedPost = await socialMediaPostRepository.updatePost(postId, {
      message: payload.content?.message,
      link: payload.content?.link,
      description: payload.content?.description,
      caption: payload.content?.caption,
      mediaUrls: processedMediaUrls,
      mediaType: payload.media?.type,
      altText: payload.media?.alt_text,
      tags: payload.content?.tags,
    });

    logger.info({ postId, userId }, 'Post updated successfully');
    return updatedPost;
  }

  /**
   * Fetch stored account token from database using platform + pageId
   * Automatically decrypts the token before returning
   */
  private async getStoredAccountToken(
    platform: SocialMediaPlatform,
    pageId: string
  ): Promise<{ accessToken: string } | null> {
    try {
      const account = await socialMediaAccountRepository.findByPlatformAndPageId(
        platform as any,
        pageId
      );

      if (!account?.accessToken) {
        return null;
      }

      // Decrypt the token before returning
      const decryptedToken = decryptToken(account.accessToken);
      return { accessToken: decryptedToken };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ platform, pageId, error: msg }, 'Failed to fetch and decrypt token');
      return null;
    }
  }

  /**
   * Publish a scheduled post immediately (with retry support)
   */
  async publishScheduledPostNow(postId: string, userId: string): Promise<SocialMediaPostResult> {
    // Get post from database
    const post = await socialMediaPostRepository.getPostById(postId);

    if (!post) {
      return {
        platform: SocialMediaPlatform.FACEBOOK,
        postId,
        status: 'failed',
        message: 'Post not found',
      };
    }

    // Verify ownership
    if (post.userId !== userId) {
      return {
        platform: post.platform as SocialMediaPlatform,
        postId,
        status: 'failed',
        message: "Unauthorized: Cannot publish another user's post",
      };
    }

    // If already published, return success
    if (post.status === 'published' && post.postId) {
      return {
        platform: post.platform as SocialMediaPlatform,
        postId: post.postId,
        status: 'success',
        message: 'Post already published',
        metadata: { postUrl: post.postUrl },
      };
    }

    try {
      // Get access token with retry fallback
      let accessToken = '';
      if (post.accessTokenEnc) {
        try {
          accessToken = decryptToken(post.accessTokenEnc);
        } catch {
          logger.warn({ postId }, 'Failed to decrypt stored token, trying account lookup');
          const accounts = await socialMediaPostRepository.getUserAccounts(userId);
          const account = accounts?.find(acc => acc.platform === post.platform);
          if (!account?.accessToken) {
            return {
              platform: post.platform as SocialMediaPlatform,
              postId,
              status: 'failed',
              message: `No valid access token for ${post.platform}`,
            };
          }
          accessToken = decryptToken(account.accessToken);
        }
      } else {
        const accounts = await socialMediaPostRepository.getUserAccounts(userId);
        const account = accounts?.find(acc => acc.platform === post.platform);
        if (!account?.accessToken) {
          return {
            platform: post.platform as SocialMediaPlatform,
            postId,
            status: 'failed',
            message: `No connected account for ${post.platform}`,
          };
        }
        accessToken = decryptToken(account.accessToken);
      }

      // Create payload
      const payload: SocialMediaPostPayload = {
        platform: post.platform as SocialMediaPlatform,
        pageId: post.pageId,
        content: {
          message: post.message || '',
          link: post.link || undefined,
          description: post.description || undefined,
          picture: post.picture || undefined,
          name: post.name || undefined,
          caption: post.caption || undefined,
          tags: post.tags,
        },
        media: post.mediaType
          ? {
              type: post.mediaType as 'image' | 'video' | 'carousel',
              url: post.mediaUrls?.[0],
              urls: post.mediaUrls,
              alt_text: post.altText || undefined,
            }
          : undefined,
        accessToken,
        metadata: post.metadata ? JSON.parse(post.metadata) : undefined,
      };

      // Post to platform
      let apiResponse: SocialMediaPostResult;
      try {
        if (post.platform === SocialMediaPlatform.FACEBOOK) {
          apiResponse = await this.postToFacebook(payload);
        } else if (post.platform === SocialMediaPlatform.INSTAGRAM) {
          apiResponse = await this.postToInstagram(payload);
        } else {
          return {
            platform: post.platform as SocialMediaPlatform,
            postId,
            status: 'failed',
            message: `Platform ${post.platform} not supported`,
          };
        }
      } catch (apiError) {
        const errorMsg = apiError instanceof Error ? apiError.message : String(apiError);
        logger.warn({ postId, error: errorMsg }, 'API posting failed');
        return {
          platform: post.platform as SocialMediaPlatform,
          postId,
          status: 'failed',
          message: `Failed to post: ${errorMsg}`,
        };
      }

      // Update database
      await socialMediaPostRepository.updatePostAfterPublish(postId, {
        platformPostId: apiResponse.postId || '',
        postUrl: apiResponse.metadata?.permalink_url,
        publishedAt: new Date(),
        status: 'published',
      });

      logger.info(
        { postId, platformPostId: apiResponse.postId, platform: post.platform },
        'Post published successfully'
      );

      return {
        platform: post.platform as SocialMediaPlatform,
        postId: apiResponse.postId,
        status: 'success',
        message: 'Post published successfully',
        metadata: apiResponse.metadata,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ postId, error: errorMsg }, 'Unexpected error publishing post');
      return {
        platform: post.platform as SocialMediaPlatform,
        postId,
        status: 'failed',
        message: `Unexpected error: ${errorMsg}`,
      };
    }
  }
}

export const socialMediaService = new SocialMediaService();
