const envelope = (data: Record<string, unknown>) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    resp_msg: { type: 'string' },
    resp_code: { type: 'integer' },
    data,
  },
});

const money = {
  costMicroUsd: { type: 'string', description: 'Integer micro-USD, as a string' },
  costUsd: { type: 'number' },
};

const breakdown = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: true,
    properties: {
      key: { type: 'string' },
      calls: { type: 'integer' },
      inputTokens: { type: 'integer' },
      outputTokens: { type: 'integer' },
      ...money,
    },
  },
};

const range = {
  from: { type: 'string', description: 'ISO date. Defaults to 30 days ago' },
  to: { type: 'string', description: 'ISO date. Defaults to now' },
};

export const GetAiUsageSummarySchema = {
  description: 'Aggregate AI spend and token usage over a date range',
  tags: ['ai-usage'],
  querystring: { type: 'object', properties: range },
  response: {
    200: envelope({
      type: 'object',
      additionalProperties: true,
      properties: {
        range: {
          type: 'object',
          additionalProperties: true,
          properties: { from: { type: 'string' }, to: { type: 'string' } },
        },
        totals: {
          type: 'object',
          additionalProperties: true,
          properties: {
            calls: { type: 'integer' },
            inputTokens: { type: 'integer' },
            outputTokens: { type: 'integer' },
            ...money,
          },
        },
        byModel: breakdown,
        byNode: breakdown,
        topUsers: breakdown,
      },
    }),
  },
};

export const GetUserQuotaSchema = {
  description: "Today's AI spend for a user against the configured daily cap",
  tags: ['ai-usage'],
  params: {
    type: 'object',
    required: ['userId'],
    properties: { userId: { type: 'string' } },
  },
  response: {
    200: envelope({
      type: 'object',
      additionalProperties: true,
      properties: {
        userId: { type: 'string' },
        enabled: { type: 'boolean', description: 'False when no daily cap is configured' },
        allowed: { type: 'boolean' },
        day: { type: 'string' },
        spent: { type: 'object', additionalProperties: true, properties: money },
        limit: { type: 'object', additionalProperties: true, properties: money },
        remaining: { type: 'object', additionalProperties: true, properties: money },
      },
    }),
  },
};

export const GetUserUsageLogsSchema = {
  description: 'Paginated AI calls made for one user',
  tags: ['ai-usage'],
  params: {
    type: 'object',
    required: ['userId'],
    properties: { userId: { type: 'string' } },
  },
  querystring: {
    type: 'object',
    properties: {
      ...range,
      page: { type: ['integer', 'string'], minimum: 1, default: 1 },
      limit: { type: ['integer', 'string'], minimum: 1, maximum: 100, default: 10 },
    },
  },
  response: {
    200: envelope({
      type: 'object',
      additionalProperties: true,
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string' },
              node: { type: 'string' },
              model: { type: 'string' },
              resource: { type: 'string' },
              operation: { type: 'string' },
              sessionId: { type: ['string', 'null'] },
              requestId: { type: ['string', 'null'] },
              inputTokens: { type: 'integer' },
              outputTokens: { type: 'integer' },
              cacheReadTokens: { type: 'integer' },
              cacheWriteTokens: { type: 'integer' },
              latencyMs: { type: 'integer' },
              success: { type: 'boolean' },
              cached: { type: 'boolean' },
              errorCode: { type: ['string', 'null'] },
              createdAt: { type: 'string' },
              ...money,
            },
          },
        },
        pagination: {
          type: 'object',
          additionalProperties: true,
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasMore: { type: 'boolean' },
          },
        },
      },
    }),
  },
};
