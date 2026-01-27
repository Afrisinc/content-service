/**
 * AI Generation Service
 * Handles AI content generation and scheduling
 */

import { SocialMediaPlatform, SocialMediaPostPayload } from '@/types/socialMedia.types';
import { GeneratePostRequest, GeneratePostResponse } from '@/types/aiGeneration.types';
import { openaiHelper } from '@/helpers/openai.helper';
import { socialMediaPostRepository } from '@/repositories/socialMediaPost.repository';
import { socialMediaService } from './socialMedia.service';
import { logger } from '@/utils/logger';

class AIGenerationService {
  /**
   * Generate posts from prompt and optionally schedule them
   */
  async generateAndSchedulePosts(request: GeneratePostRequest): Promise<GeneratePostResponse> {
    try {
      logger.info(
        {
          platforms: request.platforms,
          hasSchedule: !!request.scheduleFor,
        },
        'Starting AI post generation'
      );

      // Generate image if requested, or analyze provided image
      let generatedImageUrl: string | undefined;
      let imageCaption: string | undefined;

      if (request.includeImage) {
        try {
          logger.info(
            {
              prompt: request.prompt.substring(0, 100),
              style: request.imageStyle || 'default',
            },
            'Generating image with DALL-E'
          );

          generatedImageUrl = await openaiHelper.generateImage(request.prompt, request.imageStyle);

          // Generate caption for the generated image
          try {
            imageCaption = await openaiHelper.generateContentWithVision(
              generatedImageUrl,
              `Create a brief, engaging caption for this generated image that fits the following prompt: ${request.prompt}. Keep it concise and suitable for social media.`
            );
          } catch (captionError) {
            logger.warn(
              {
                error: captionError instanceof Error ? captionError.message : String(captionError),
              },
              'Failed to generate image caption'
            );
          }
        } catch (error) {
          logger.warn(
            {
              prompt: request.prompt.substring(0, 100),
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to generate image, proceeding with text-only content'
          );
        }
      } else if (request.imageUrl) {
        try {
          imageCaption = await openaiHelper.generateContentWithVision(
            request.imageUrl,
            `Create a brief, engaging caption for this image that fits the following prompt: ${request.prompt}. Keep it concise and suitable for social media.`
          );
        } catch (error) {
          logger.warn(
            {
              imageUrl: request.imageUrl,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to generate image caption, proceeding with text-only content'
          );
        }
      }

      // Generate content using OpenAI
      const generatedContent = await openaiHelper.generateContent({
        prompt: request.prompt,
        maxLength: request.maxLength || 500,
        tone: request.tone || 'professional',
        includeEmojis: request.includeEmojis ?? true,
        includeHashtags: request.includeHashtags ?? true,
        language: request.language || 'en',
      });

      // Extract content for requested platforms
      const platformContent: Record<string, string> = {};
      const validPlatforms: SocialMediaPlatform[] = [];

      for (const platform of request.platforms) {
        const content = generatedContent[platform as keyof typeof generatedContent];
        if (content && typeof content === 'string') {
          platformContent[platform] = content;
          validPlatforms.push(platform);
        }
      }

      if (validPlatforms.length === 0) {
        return {
          success: false,
          message: 'No content generated for requested platforms',
          error: 'Content generation failed for all platforms',
        };
      }

      // Create database records for generated posts
      const postIds: string[] = [];

      for (const platform of validPlatforms) {
        try {
          const post = await socialMediaPostRepository.createPost({
            userId: request.userId || '',
            platform,
            pageId: 'scheduled', // Will be set when publishing
            message: platformContent[platform],
            tags: generatedContent.hashtags || [],
            scheduledAt: request.scheduleFor || undefined,
            aiGenerated: true,
            aiProvider: 'openai',
            aiModel: generatedContent.metadata.model,
            aiPrompt: request.prompt,
            metadata: JSON.stringify({
              generatedBy: 'openai',
              generationPrompt: request.prompt,
              generatedAt: new Date().toISOString(),
              tokensUsed: generatedContent.metadata.tokensUsed,
              originalTone: request.tone,
              includeEmojis: request.includeEmojis,
              includeHashtags: request.includeHashtags,
              imageUrl: generatedImageUrl || request.imageUrl,
              imageCaption,
              imageStyle: request.imageStyle,
            }),
          });

          postIds.push(post.id);

          logger.info(
            {
              postId: post.id,
              platform,
              scheduled: !!request.scheduleFor,
            },
            'Post created from AI generation'
          );
        } catch (error) {
          logger.error(
            {
              platform,
              error: error instanceof Error ? error.message : String(error),
            },
            'Failed to create post record'
          );
        }
      }

      return {
        success: true,
        message: `Successfully generated and ${request.scheduleFor ? 'scheduled' : 'created'} posts for ${validPlatforms.length} platform(s)`,
        data: {
          postIds,
          platforms: validPlatforms,
          content: platformContent,
          scheduledFor: request.scheduleFor || undefined,
          hashtags: generatedContent.hashtags,
          imageUrl: generatedImageUrl || request.imageUrl,
          imageCaption,
          metadata: generatedContent.metadata,
        },
      };
    } catch (error) {
      logger.error(
        {
          prompt: request.prompt.substring(0, 100),
          error: error instanceof Error ? error.message : String(error),
        },
        'AI post generation failed'
      );

      return {
        success: false,
        message: 'Failed to generate posts',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Generate post for a specific platform
   */
  async generatePostForPlatform(
    prompt: string,
    platform: SocialMediaPlatform,
    options?: {
      tone?: 'professional' | 'casual' | 'humorous' | 'promotional';
      maxLength?: number;
      includeEmojis?: boolean;
      includeHashtags?: boolean;
    }
  ): Promise<string> {
    try {
      const content = await openaiHelper.generateContentForPlatform({
        prompt,
        platform,
        maxLength: options?.maxLength || 500,
        tone: options?.tone || 'professional',
        includeEmojis: options?.includeEmojis ?? true,
        includeHashtags: options?.includeHashtags ?? true,
      });

      return content;
    } catch (error) {
      logger.error(
        {
          platform,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to generate platform-specific content'
      );
      throw error;
    }
  }

  /**
   * Publish scheduled posts that are due
   */
  async publishScheduledPosts(): Promise<{
    published: number;
    failed: number;
    errors: string[];
  }> {
    try {
      logger.info({}, 'Checking for posts to publish');

      const postsToPublish = await socialMediaPostRepository.getPostsReadyToPublish();

      let published = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const post of postsToPublish) {
        try {
          // Create payload from post data
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
            },
            accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
            metadata: post.metadata ? JSON.parse(post.metadata) : undefined,
          };

          // Post to platform
          const result = await socialMediaService.postToSocialMedia(payload, post.userId);

          if (result.status === 'success' || result.status === 'pending') {
            // Update post in database
            const postUrl = result.metadata?.postUrl || `https://${post.platform}.com/${result.postId}`;
            await socialMediaPostRepository.updatePostAfterPublish(post.id, {
              status: 'published',
              platformPostId: result.postId || '',
              postUrl,
              publishedAt: new Date(),
            });

            published++;
            logger.info(
              {
                postId: post.id,
                platform: post.platform,
              },
              'Scheduled post published'
            );
          } else {
            failed++;
            const errorMsg = `Failed to publish ${post.platform} post: ${result.message}`;
            errors.push(errorMsg);

            await socialMediaPostRepository.markPostFailed(post.id, errorMsg);

            logger.error(
              {
                postId: post.id,
                platform: post.platform,
                error: result.message,
              },
              'Failed to publish scheduled post'
            );
          }
        } catch (error) {
          failed++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(errorMsg);

          await socialMediaPostRepository.markPostFailed(post.id, errorMsg);

          logger.error(
            {
              postId: post.id,
              error: errorMsg,
            },
            'Error publishing scheduled post'
          );
        }
      }

      return { published, failed, errors };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Scheduled post publishing check failed'
      );
      throw error;
    }
  }

  /**
   * Get generation history for user
   */
  async getUserGenerationHistory(userId: string, limit = 10, offset = 0) {
    try {
      const posts = await socialMediaPostRepository.getAIGeneratedPosts(userId, limit, offset);

      return {
        success: true,
        data: posts,
        count: posts.length,
      };
    } catch (error) {
      logger.error(
        {
          userId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch generation history'
      );
      throw error;
    }
  }
}

export const aiGenerationService = new AIGenerationService();
