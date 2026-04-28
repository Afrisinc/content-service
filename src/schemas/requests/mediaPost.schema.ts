/**
 * MediaPost Request Validation Schemas
 * Zod/JSON Schema validations for MediaPost endpoints
 */

export const CreateMediaPostSchema = {
  type: 'object',
  required: ['title', 'content', 'slug'],
  properties: {
    title: {
      type: 'string',
      minLength: 5,
      maxLength: 200,
      description: 'Article title',
    },
    content: {
      type: 'string',
      minLength: 100,
      description: 'Full HTML body content',
    },
    excerpt: {
      type: 'string',
      maxLength: 300,
      description: '2-3 sentence summary for cards',
    },
    slug: {
      type: 'string',
      minLength: 5,
      maxLength: 100,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      description: 'URL-friendly slug (unique)',
    },
    cover_image: {
      type: 'string',
      format: 'uri',
      description: 'Cover image URL',
    },
    cover_alt: {
      type: 'string',
      maxLength: 125,
      description: 'Alt text for cover image (SEO)',
    },
    media_type: {
      type: 'string',
      enum: ['image', 'video', 'carousel'],
      description: 'Primary media type of article',
    },
    video_url: {
      type: 'string',
      format: 'uri',
      description: 'Direct video URL if primary media is video',
    },
    video_poster: {
      type: 'string',
      format: 'uri',
      description: 'Thumbnail/poster frame for video',
    },
    video_duration: {
      type: 'integer',
      minimum: 0,
      description: 'Video duration in seconds',
    },
    media_urls: {
      type: 'array',
      items: { type: 'string', format: 'uri' },
      maxItems: 20,
      description: 'Multiple media URLs (images/videos)',
    },
    category: {
      type: 'string',
      maxLength: 50,
      description: 'Article category',
    },
    tags: {
      type: 'array',
      items: { type: 'string', maxLength: 30 },
      maxItems: 15,
      description: 'Article tags',
    },
    topic: {
      type: 'string',
      maxLength: 50,
      description: 'Broad topic bucket (finance, tech, politics, etc)',
    },
    meta_title: {
      type: 'string',
      maxLength: 60,
      description: 'SEO meta title (defaults to title if null)',
    },
    meta_description: {
      type: 'string',
      maxLength: 155,
      description: 'SEO meta description',
    },
    canonical_url: {
      type: 'string',
      format: 'uri',
      description: 'For syndicated/republished content',
    },
    og_title: {
      type: 'string',
      maxLength: 100,
      description: 'Open Graph title for social previews',
    },
    og_description: {
      type: 'string',
      maxLength: 200,
      description: 'Open Graph description',
    },
    og_image: {
      type: 'string',
      format: 'uri',
      description: 'Open Graph image URL',
    },
    twitter_card: {
      type: 'string',
      enum: ['summary', 'summary_large_image', 'player', 'app'],
      default: 'summary_large_image',
    },
    twitter_title: {
      type: 'string',
      maxLength: 70,
    },
    twitter_description: {
      type: 'string',
      maxLength: 200,
    },
    status: {
      type: 'string',
      enum: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT',
    },
    is_featured: {
      type: 'boolean',
      default: false,
    },
    is_breaking: {
      type: 'boolean',
      default: false,
    },
    is_sponsored: {
      type: 'boolean',
      default: false,
    },
    sponsor_name: {
      type: 'string',
      maxLength: 100,
    },
    sponsor_url: {
      type: 'string',
      format: 'uri',
    },
    published_at: {
      type: 'string',
      format: 'date-time',
    },
    scheduled_at: {
      type: 'string',
      format: 'date-time',
    },
    read_time: {
      type: 'integer',
      minimum: 1,
      maximum: 60,
      default: 3,
      description: 'Estimated reading time in minutes',
    },
    language: {
      type: 'string',
      maxLength: 5,
      default: 'en',
    },
    word_count: {
      type: 'integer',
      minimum: 0,
    },
    ai_generated: {
      type: 'boolean',
      default: false,
    },
    ai_provider: {
      type: 'string',
      enum: ['anthropic', 'openai', null],
    },
    ai_model: {
      type: 'string',
      maxLength: 100,
    },
    ai_prompt: {
      type: 'string',
      description: 'Exact prompt used for generation (critical for improvement)',
    },
    ai_score: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Quality/relevance score from filter step',
    },
    source_url: {
      type: 'string',
      format: 'uri',
      description: 'Original news source URL',
    },
    source_name: {
      type: 'string',
      maxLength: 100,
      description: 'Source name (Reuters, TechCrunch, etc)',
    },
    in_newsletter: {
      type: 'boolean',
      default: false,
    },
    rss_guid: {
      type: 'string',
      description: 'Stable GUID for RSS feed',
    },
    n8nArticleId: {
      type: 'integer',
      description: 'Related N8n article ID',
    },
    authorId: {
      type: 'string',
      description: 'Author user ID',
    },
  },
};

export const UpdateMediaPostSchema = {
  type: 'object',
  properties: CreateMediaPostSchema.properties,
  additionalProperties: false,
};

export const GetMediaPostsQuerySchema = {
  type: 'object',
  properties: {
    page: {
      type: 'integer',
      minimum: 1,
      default: 1,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      default: 10,
    },
    status: {
      type: 'string',
      enum: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'],
    },
    category: {
      type: 'string',
    },
    topic: {
      type: 'string',
    },
    is_featured: {
      type: 'boolean',
    },
    is_breaking: {
      type: 'boolean',
    },
    ai_generated: {
      type: 'boolean',
    },
    in_newsletter: {
      type: 'boolean',
    },
    search: {
      type: 'string',
      maxLength: 200,
      description: 'Search in title, excerpt, and content',
    },
    sortBy: {
      type: 'string',
      enum: ['published_at', 'created_at', 'updated_at', 'views', 'shares'],
      default: 'published_at',
    },
    sortOrder: {
      type: 'string',
      enum: ['asc', 'desc'],
      default: 'desc',
    },
  },
};

export const BulkMediaPostActionSchema = {
  type: 'object',
  required: ['ids', 'action'],
  properties: {
    ids: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 100,
      description: 'MediaPost IDs to perform action on',
    },
    action: {
      type: 'string',
      enum: ['publish', 'draft', 'archive', 'feature', 'unfeature', 'delete'],
      description: 'Action to perform',
    },
    data: {
      type: 'object',
      description: 'Optional data for the action',
    },
  },
};
