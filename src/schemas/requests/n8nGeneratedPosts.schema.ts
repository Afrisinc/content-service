/**
 * N8N Generated Posts Request Schemas
 * Fastify JSON schemas for N8N generated posts endpoints
 */

export const GetAllGeneratedPostsSchema = {
  description: 'Get all N8N generated posts with pagination',
  tags: ['generated-posts'],
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
        description: 'Number of posts per page',
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
              description: 'Array of generated posts',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string' },
                  post_id: { type: 'string' },
                  topic: { type: 'string' },
                  platform: { type: 'string' },
                  fb_post_id: { type: 'string' },
                  fb_url: { type: 'string' },
                  fb_content: { type: 'string' },
                  fb_hashtags: { type: 'string' },
                  insta_post_id: { type: 'string' },
                  insta_url: { type: 'string' },
                  insta_content: { type: 'string' },
                  insta_hashtags: { type: 'string' },
                  status: { type: 'string' },
                  created_at: { type: 'string' },
                  published_at: { type: 'string' },
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

export const GetGeneratedPostsByStatusSchema = {
  description: 'Get N8N generated posts by status with pagination',
  tags: ['generated-posts'],
  params: {
    type: 'object',
    required: ['status'],
    properties: {
      status: {
        type: 'string',
        description: 'Post status to filter by (e.g., draft, published)',
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
        description: 'Number of posts per page',
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
              description: 'Array of generated posts with specified status',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string' },
                  post_id: { type: 'string' },
                  topic: { type: 'string' },
                  platform: { type: 'string' },
                  fb_post_id: { type: 'string' },
                  fb_url: { type: 'string' },
                  fb_content: { type: 'string' },
                  fb_hashtags: { type: 'string' },
                  insta_post_id: { type: 'string' },
                  insta_url: { type: 'string' },
                  insta_content: { type: 'string' },
                  insta_hashtags: { type: 'string' },
                  status: { type: 'string' },
                  created_at: { type: 'string' },
                  published_at: { type: 'string' },
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

export const GetGeneratedPostByIdSchema = {
  description: 'Get a single N8N generated post by ID',
  tags: ['generated-posts'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        description: 'Generated post ID (numeric)',
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
            post_id: { type: 'string' },
            topic: { type: 'string' },
            platform: { type: 'string' },
            fb_post_id: { type: 'string' },
            fb_url: { type: 'string' },
            fb_content: { type: 'string' },
            fb_hashtags: { type: 'string' },
            insta_post_id: { type: 'string' },
            insta_url: { type: 'string' },
            insta_content: { type: 'string' },
            insta_hashtags: { type: 'string' },
            status: { type: 'string' },
            created_at: { type: 'string' },
            published_at: { type: 'string' },
          },
          description:
            'Generated post object with id, post_id, topic, platform, Facebook fields, Instagram fields, status, and timestamps',
        },
      },
    },
  },
};

export const CreateGeneratedPostSchema = {
  description: 'Create a new N8N generated post',
  tags: ['generated-posts'],
  body: {
    type: 'object',
    additionalProperties: true,
    properties: {
      post_id: { type: 'string', description: 'External post identifier' },
      topic: { type: 'string', description: 'Topic or title of the post' },
      platform: { type: 'string', description: 'Target platform (facebook, instagram, etc.)' },
      fb_post_id: { type: 'string', description: 'Facebook post ID' },
      fb_url: { type: 'string', description: 'Facebook post URL' },
      fb_content: { type: 'string', description: 'Facebook post content' },
      fb_hashtags: { type: 'string', description: 'Facebook post hashtags' },
      insta_post_id: { type: 'string', description: 'Instagram post ID' },
      insta_url: { type: 'string', description: 'Instagram post URL' },
      insta_content: { type: 'string', description: 'Instagram post content' },
      insta_hashtags: { type: 'string', description: 'Instagram post hashtags' },
      status: { type: 'string', description: 'Post status (draft, published, etc.)' },
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
          type: 'object',
          additionalProperties: true,
          properties: {
            id: { type: 'string' },
            post_id: { type: 'string' },
            topic: { type: 'string' },
            platform: { type: 'string' },
            fb_post_id: { type: 'string' },
            fb_url: { type: 'string' },
            fb_content: { type: 'string' },
            fb_hashtags: { type: 'string' },
            insta_post_id: { type: 'string' },
            insta_url: { type: 'string' },
            insta_content: { type: 'string' },
            insta_hashtags: { type: 'string' },
            status: { type: 'string' },
            created_at: { type: 'string' },
            published_at: { type: 'string' },
          },
        },
      },
    },
  },
};

export const UpdateGeneratedPostSchema = {
  description: 'Update an existing N8N generated post',
  tags: ['generated-posts'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        description: 'Generated post ID',
      },
    },
  },
  body: {
    type: 'object',
    additionalProperties: true,
    properties: {
      post_id: { type: 'string', description: 'External post identifier' },
      topic: { type: 'string', description: 'Topic or title of the post' },
      platform: { type: 'string', description: 'Target platform (facebook, instagram, etc.)' },
      fb_post_id: { type: 'string', description: 'Facebook post ID' },
      fb_url: { type: 'string', description: 'Facebook post URL' },
      fb_content: { type: 'string', description: 'Facebook post content' },
      fb_hashtags: { type: 'string', description: 'Facebook post hashtags' },
      insta_post_id: { type: 'string', description: 'Instagram post ID' },
      insta_url: { type: 'string', description: 'Instagram post URL' },
      insta_content: { type: 'string', description: 'Instagram post content' },
      insta_hashtags: { type: 'string', description: 'Instagram post hashtags' },
      status: { type: 'string', description: 'Post status (draft, published, etc.)' },
      published_at: { type: 'string', description: 'Publication timestamp' },
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
            post_id: { type: 'string' },
            topic: { type: 'string' },
            platform: { type: 'string' },
            fb_post_id: { type: 'string' },
            fb_url: { type: 'string' },
            fb_content: { type: 'string' },
            fb_hashtags: { type: 'string' },
            insta_post_id: { type: 'string' },
            insta_url: { type: 'string' },
            insta_content: { type: 'string' },
            insta_hashtags: { type: 'string' },
            status: { type: 'string' },
            created_at: { type: 'string' },
            published_at: { type: 'string' },
          },
        },
      },
    },
  },
};

export const DeleteGeneratedPostSchema = {
  description: 'Delete an N8N generated post',
  tags: ['generated-posts'],
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: {
        type: 'string',
        description: 'Generated post ID',
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
            post_id: { type: 'string' },
            topic: { type: 'string' },
            platform: { type: 'string' },
            fb_post_id: { type: 'string' },
            fb_url: { type: 'string' },
            fb_content: { type: 'string' },
            fb_hashtags: { type: 'string' },
            insta_post_id: { type: 'string' },
            insta_url: { type: 'string' },
            insta_content: { type: 'string' },
            insta_hashtags: { type: 'string' },
            status: { type: 'string' },
            created_at: { type: 'string' },
            published_at: { type: 'string' },
          },
        },
      },
    },
  },
};

export const GetGeneratedPostsByPlatformSchema = {
  description: 'Get N8N generated posts by platform with pagination',
  tags: ['generated-posts'],
  params: {
    type: 'object',
    required: ['platform'],
    properties: {
      platform: {
        type: 'string',
        description: 'Platform to filter by (facebook, instagram, etc.)',
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
        description: 'Number of posts per page',
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
              description: 'Array of generated posts for specified platform',
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string' },
                  post_id: { type: 'string' },
                  topic: { type: 'string' },
                  platform: { type: 'string' },
                  fb_post_id: { type: 'string' },
                  fb_url: { type: 'string' },
                  fb_content: { type: 'string' },
                  fb_hashtags: { type: 'string' },
                  insta_post_id: { type: 'string' },
                  insta_url: { type: 'string' },
                  insta_content: { type: 'string' },
                  insta_hashtags: { type: 'string' },
                  status: { type: 'string' },
                  created_at: { type: 'string' },
                  published_at: { type: 'string' },
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
