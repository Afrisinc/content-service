/**
 * N8N Articles Request Schemas
 * Fastify JSON schemas for N8N articles endpoints
 */

export const GetAllArticlesSchema = {
  description: 'Get all N8N articles with search and pagination',
  tags: ['articles'],
  querystring: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search term to filter articles by headline, summary, or creator',
      },
      status: {
        type: 'string',
        enum: ['draft', 'processing', 'published', 'skipped', 'failed'],
        description: 'Filter articles by processing status',
      },
      page: {
        type: ['integer', 'string'],
        minimum: 1,
        default: 1,
        description: 'Page number for pagination',
      },
      limit: {
        type: ['integer', 'string'],
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Number of articles per page',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          type: 'object',
          additionalProperties: true,
          properties: {
            data: {
              type: 'array',
              description: 'Array of articles',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string' },
                  guid: { type: 'string' },
                  source_url: { type: 'string' },
                  source_headline: { type: 'string' },
                  source_summary: { type: 'string' },
                  image_url: { type: 'string' },
                  pub_date: { type: 'string' },
                  category: { type: 'string' },
                  creator: { type: 'string' },
                  status: { type: 'string' },
                  isFeatured: { type: 'boolean' },
                  created_at: { type: 'string' },
                  updated_at: { type: 'string' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasMore: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};

export const GetArticlesByCategorySchema = {
  description: 'Get N8N articles by category with pagination',
  tags: ['articles'],
  params: {
    type: 'object',
    required: ['category'],
    properties: {
      category: {
        type: 'string',
        description: 'Article category to filter by',
      },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      page: {
        type: ['integer', 'string'],
        minimum: 1,
        default: 1,
        description: 'Page number for pagination',
      },
      limit: {
        type: ['integer', 'string'],
        minimum: 1,
        maximum: 100,
        default: 10,
        description: 'Number of articles per page',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          type: 'object',
          additionalProperties: true,
          properties: {
            data: {
              type: 'array',
              description: 'Array of articles in category',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string' },
                  guid: { type: 'string' },
                  source_url: { type: 'string' },
                  source_headline: { type: 'string' },
                  source_summary: { type: 'string' },
                  image_url: { type: 'string' },
                  pub_date: { type: 'string' },
                  category: { type: 'string' },
                  creator: { type: 'string' },
                  status: { type: 'string' },
                  isFeatured: { type: 'boolean' },
                  created_at: { type: 'string' },
                  updated_at: { type: 'string' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasMore: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};

export const CheckGuidSchema = {
  description: 'Check if an article with the given GUID already exists',
  tags: ['articles'],
  querystring: {
    type: 'object',
    required: ['guid'],
    properties: {
      guid: {
        type: 'string',
        description: 'RSS GUID to check for existence',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          type: 'object',
          additionalProperties: true,
          properties: {
            exists: { type: 'boolean' },
            guid: { type: 'string' },
          },
        },
      },
    },
    404: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
      },
    },
  },
};

export const ArticleItemSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    guid: { type: 'string' },
    source_url: { type: 'string' },
    source_headline: { type: 'string' },
    source_summary: { type: 'string' },
    image_url: { type: 'string' },
    pub_date: { type: 'string' },
    category: { type: 'string' },
    creator: { type: 'string' },
    status: { type: 'string' },
    is_featured: { type: 'boolean' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
  },
};

export const CreateArticleSchema = {
  description: 'Ingest a new raw article from an RSS feed (called by n8n WF1)',
  tags: ['articles'],
  body: {
    type: 'object',
    required: ['guid', 'source_url'],
    properties: {
      guid: {
        type: 'string',
        description: 'Unique RSS GUID for deduplication',
      },
      source_url: {
        type: 'string',
        description: 'Canonical URL of the original article',
      },
      source_headline: {
        type: 'string',
        description: 'Article title from the feed',
      },
      source_summary: {
        type: 'string',
        description: 'Article description / excerpt from the feed',
      },
      pub_date: {
        type: 'string',
        description: 'Publication date string from the feed (ISO 8601)',
      },
      category: {
        type: 'string',
        description: 'Content category (tech, business, startup, culture, news, crypto, finance, general)',
      },
      creator: {
        type: 'string',
        description: 'Source feed name or author',
      },
      status: {
        type: 'string',
        enum: ['draft', 'processing', 'published', 'skipped', 'failed'],
        default: 'draft',
        description: 'Processing status',
      },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          ...ArticleItemSchema,
        },
      },
    },
    409: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
      },
    },
  },
};

export const UpdateArticleSchema = {
  description: 'Update an N8N article (used by n8n WF2 to update processing status and image)',
  tags: ['articles'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        description: 'Article ID (numeric)',
      },
    },
  },
  body: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['draft', 'processing', 'published', 'skipped', 'failed'],
        description: 'Processing status',
      },
      image_url: {
        type: 'string',
        description: 'DALL-E 3 generated cover image URL',
      },
      processing_error: {
        type: 'string',
        description: 'Error message if processing failed',
      },
      is_featured: {
        type: 'boolean',
        description: 'Whether the article is featured',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  },
};

export const GetArticleByIdSchema = {
  description: 'Get a single N8N article by ID',
  tags: ['articles'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        description: 'Article ID (numeric)',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          type: 'object',
          additionalProperties: true,
          properties: {
            id: { type: 'string' },
            guid: { type: 'string' },
            source_url: { type: 'string' },
            source_headline: { type: 'string' },
            source_summary: { type: 'string' },
            image_url: { type: 'string' },
            pub_date: { type: 'string' },
            category: { type: 'string' },
            creator: { type: 'string' },
            status: { type: 'string' },
            isFeatured: { type: 'boolean' },
            created_at: { type: 'string' },
            updated_at: { type: 'string' },
          },
          description:
            'Article object with id, guid, source_url, source_headline, source_summary, image_url, pub_date, category, creator, status, isFeatured, created_at, updated_at',
        },
      },
    },
  },
};
