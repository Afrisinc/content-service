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
