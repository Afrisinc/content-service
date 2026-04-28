/**
 * MediaPost Response Validation Schemas
 * Response format definitions for API endpoints
 */

export const MediaPostResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: 'string' },
    cover_image: { type: 'string' },
    cover_alt: { type: 'string' },
    media_type: { type: 'string' },
    video_url: { type: 'string' },
    video_poster: { type: 'string' },
    video_duration: { type: 'integer' },
    media_urls: {
      type: 'array',
      items: { type: 'string' },
    },
    category: { type: 'string' },
    tags: {
      type: 'array',
      items: { type: 'string' },
    },
    topic: { type: 'string' },
    status: { type: 'string' },
    is_featured: { type: 'boolean' },
    is_breaking: { type: 'boolean' },
    is_sponsored: { type: 'boolean' },
    published_at: { type: 'string', format: 'date-time' },
    read_time: { type: 'integer' },
    language: { type: 'string' },
    views: { type: 'integer' },
    shares: { type: 'integer' },
    ai_generated: { type: 'boolean' },
    source_name: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
};

export const PaginatedMediaPostResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        posts: {
          type: 'array',
          items: MediaPostResponseSchema,
        },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
            pages: { type: 'integer' },
          },
        },
      },
    },
  },
};

export const SingleMediaPostResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: MediaPostResponseSchema,
  },
};

export const MediaPostStatsResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        totalPosts: { type: 'integer' },
        publishedPosts: { type: 'integer' },
        draftPosts: { type: 'integer' },
        scheduledPosts: { type: 'integer' },
        archivedPosts: { type: 'integer' },
        featuredPosts: { type: 'integer' },
        breakingPosts: { type: 'integer' },
        totalViews: { type: 'integer' },
        totalShares: { type: 'integer' },
        averageReadTime: { type: 'number' },
      },
    },
  },
};

export const BulkActionResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        total: { type: 'integer' },
        succeeded: { type: 'integer' },
        failed: { type: 'integer' },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
  },
};
