/**
 * MediaPost Service
 * Business logic for media post operations
 */

import { MediaPostRepository } from '@/repositories/mediaPost.repository';
import {
  CreateMediaPostPayload,
  UpdateMediaPostPayload,
  MediaPostQueryParams,
  BulkMediaPostAction,
} from '@/types/mediaPost.types';

export class MediaPostService {
  private repository: MediaPostRepository;

  constructor() {
    this.repository = new MediaPostRepository();
  }

  /**
   * Create a new media post
   */
  async createPost(data: CreateMediaPostPayload) {
    // Check if slug already exists
    const slugExists = await this.repository.slugExists(data.slug);
    if (slugExists) {
      throw new Error(`Slug "${data.slug}" already exists. Please use a unique slug.`);
    }

    // Validate required fields
    if (!data.title || !data.content || !data.slug) {
      throw new Error('Title, content, and slug are required fields.');
    }

    // Create the post
    const post = await this.repository.create(data);

    return {
      success: true,
      message: 'Media post created successfully',
      data: post,
    };
  }

  /**
   * Get media post by ID
   */
  async getPostById(id: string) {
    const post = await this.repository.getById(id);

    if (!post) {
      throw new Error(`Media post with ID "${id}" not found.`);
    }

    // Increment view count
    await this.repository.incrementViews(id);

    return {
      success: true,
      message: 'Media post retrieved successfully',
      data: post,
    };
  }

  /**
   * Get media post by slug
   */
  async getPostBySlug(slug: string) {
    const post = await this.repository.getBySlug(slug);

    if (!post) {
      throw new Error(`Media post with slug "${slug}" not found.`);
    }

    // Increment view count
    await this.repository.incrementViews(post.id);

    return {
      success: true,
      message: 'Media post retrieved successfully',
      data: post,
    };
  }

  /**
   * Get paginated media posts with filters
   */
  async getPosts(params: MediaPostQueryParams) {
    const result = await this.repository.getPaginated(params);

    return {
      success: true,
      message: 'Media posts retrieved successfully',
      data: {
        posts: result.posts,
        pagination: result.pagination,
      },
    };
  }

  /**
   * Update media post
   */
  async updatePost(id: string, data: UpdateMediaPostPayload) {
    const post = await this.repository.getById(id);

    if (!post) {
      throw new Error(`Media post with ID "${id}" not found.`);
    }

    // If slug is being updated, check if new slug is unique
    if (data.slug && data.slug !== post.slug) {
      const slugExists = await this.repository.slugExists(data.slug, id);
      if (slugExists) {
        throw new Error(`Slug "${data.slug}" already exists. Please use a unique slug.`);
      }
    }

    const updatedPost = await this.repository.update(id, data);

    return {
      success: true,
      message: 'Media post updated successfully',
      data: updatedPost,
    };
  }

  /**
   * Delete media post
   */
  async deletePost(id: string) {
    const post = await this.repository.getById(id);

    if (!post) {
      throw new Error(`Media post with ID "${id}" not found.`);
    }

    await this.repository.delete(id);

    return {
      success: true,
      message: 'Media post deleted successfully',
    };
  }

  /**
   * Archive media post (soft delete)
   */
  async archivePost(id: string) {
    const post = await this.repository.getById(id);

    if (!post) {
      throw new Error(`Media post with ID "${id}" not found.`);
    }

    const archived = await this.repository.archive(id);

    return {
      success: true,
      message: 'Media post archived successfully',
      data: archived,
    };
  }

  /**
   * Publish media post
   */
  async publishPost(id: string) {
    const post = await this.repository.getById(id);

    if (!post) {
      throw new Error(`Media post with ID "${id}" not found.`);
    }

    const published = await this.repository.update(id, {
      status: 'PUBLISHED' as any,
      published_at: new Date(),
    });

    return {
      success: true,
      message: 'Media post published successfully',
      data: published,
    };
  }

  /**
   * Schedule media post for publishing
   */
  async schedulePost(id: string, scheduledAt: Date) {
    const post = await this.repository.getById(id);

    if (!post) {
      throw new Error(`Media post with ID "${id}" not found.`);
    }

    if (scheduledAt <= new Date()) {
      throw new Error('Scheduled time must be in the future.');
    }

    const scheduled = await this.repository.update(id, {
      status: 'SCHEDULED' as any,
      scheduled_at: scheduledAt,
    });

    return {
      success: true,
      message: 'Media post scheduled successfully',
      data: scheduled,
    };
  }

  /**
   * Get featured posts
   */
  async getFeaturedPosts(limit?: number) {
    const posts = await this.repository.getFeatured(limit);

    return {
      success: true,
      message: 'Featured posts retrieved successfully',
      data: posts,
    };
  }

  /**
   * Get breaking news posts
   */
  async getBreakingNews(limit?: number) {
    const posts = await this.repository.getBreaking(limit);

    return {
      success: true,
      message: 'Breaking news posts retrieved successfully',
      data: posts,
    };
  }

  /**
   * Get posts by category
   */
  async getByCategory(category: string, limit?: number) {
    const posts = await this.repository.getByCategory(category, limit);

    return {
      success: true,
      message: `Posts in "${category}" category retrieved successfully`,
      data: posts,
    };
  }

  /**
   * Get posts by topic
   */
  async getByTopic(topic: string, limit?: number) {
    const posts = await this.repository.getByTopic(topic, limit);

    return {
      success: true,
      message: `Posts on "${topic}" topic retrieved successfully`,
      data: posts,
    };
  }

  /**
   * Search media posts
   */
  async searchPosts(query: string, limit?: number) {
    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty.');
    }

    const posts = await this.repository.search(query, limit);

    return {
      success: true,
      message: 'Search results retrieved successfully',
      data: posts,
    };
  }

  /**
   * Get AI-generated posts
   */
  async getAiGeneratedPosts(limit?: number) {
    const posts = await this.repository.getAiGenerated(limit);

    return {
      success: true,
      message: 'AI-generated posts retrieved successfully',
      data: posts,
    };
  }

  /**
   * Get posts for newsletter
   */
  async getNewsletterPosts(limit?: number) {
    const posts = await this.repository.getForNewsletter(limit);

    return {
      success: true,
      message: 'Newsletter posts retrieved successfully',
      data: posts,
    };
  }

  /**
   * Get video articles
   */
  async getVideoArticles(limit?: number) {
    const posts = await this.repository.getVideoArticles(limit);

    return {
      success: true,
      message: 'Video articles retrieved successfully',
      data: posts,
    };
  }

  /**
   * Record share for media post
   */
  async recordShare(id: string) {
    const post = await this.repository.getById(id);

    if (!post) {
      throw new Error(`Media post with ID "${id}" not found.`);
    }

    await this.repository.incrementShares(id);

    return {
      success: true,
      message: 'Share recorded successfully',
    };
  }

  /**
   * Get media post statistics
   */
  async getStatistics() {
    const stats = await this.repository.getStats();

    return {
      success: true,
      message: 'Statistics retrieved successfully',
      data: stats,
    };
  }

  /**
   * Perform bulk action on media posts
   */
  async bulkAction(action: BulkMediaPostAction) {
    const { ids, action: actionType } = action;

    if (!ids || ids.length === 0) {
      throw new Error('No media post IDs provided.');
    }

    if (ids.length > 100) {
      throw new Error('Maximum 100 posts can be processed in bulk action.');
    }

    const errors: Array<{ id: string; error: string }> = [];
    let succeeded = 0;

    try {
      switch (actionType) {
        case 'publish':
          await this.repository.bulkUpdateStatus(ids, 'PUBLISHED');
          succeeded = ids.length;
          break;

        case 'draft':
          await this.repository.bulkUpdateStatus(ids, 'DRAFT');
          succeeded = ids.length;
          break;

        case 'archive':
          await this.repository.bulkUpdateStatus(ids, 'ARCHIVED');
          succeeded = ids.length;
          break;

        case 'feature':
          await this.repository.bulkToggleFeature(ids, true);
          succeeded = ids.length;
          break;

        case 'unfeature':
          await this.repository.bulkToggleFeature(ids, false);
          succeeded = ids.length;
          break;

        case 'delete':
          await this.repository.bulkDelete(ids);
          succeeded = ids.length;
          break;

        default:
          throw new Error(`Unknown bulk action: ${actionType}`);
      }
    } catch (error: any) {
      errors.push({
        id: 'bulk_action',
        error: error.message,
      });
    }

    return {
      success: errors.length === 0,
      message: errors.length === 0 ? 'Bulk action completed successfully' : 'Bulk action completed with errors',
      data: {
        total: ids.length,
        succeeded,
        failed: ids.length - succeeded,
        errors,
      },
    };
  }
}
