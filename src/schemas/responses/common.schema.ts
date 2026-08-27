export const SuccessResponseSchema = <T>(dataSchema: T) =>
  ({
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        example: true,
        description: 'Indicates if the request was successful',
      },
      message: {
        type: 'string',
        description: 'Success message describing the operation',
      },
      data: dataSchema,
    },
    required: ['success', 'message'],
  }) as const;

export const ErrorResponseSchema = {
  type: 'object',
  properties: {
    success: {
      type: 'boolean',
      example: false,
      description: 'Indicates that the request failed',
    },
    message: {
      type: 'string',
      description: 'Error message describing what went wrong',
    },
  },
  required: ['success', 'message'],
} as const;

export const HealthResponseSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      example: 'ok',
      description: 'Server status indicator',
    },
    message: {
      type: 'string',
      example: 'Server is running',
      description: 'Server status message',
    },
  },
  required: ['status', 'message'],
} as const;

export const LiveResponseSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      example: 'up',
      description: 'Process liveness indicator',
    },
  },
  required: ['status'],
} as const;

const CheckResultSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['up', 'down'] },
    latencyMs: { type: 'number' },
    error: { type: 'string' },
  },
  required: ['status'],
} as const;

export const ReadyResponseSchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      example: 'healthy',
      description: 'Overall readiness indicator',
    },
    statusCode: { type: 'number' },
    db: CheckResultSchema,
    redis: CheckResultSchema,
  },
  required: ['status', 'db', 'redis'],
} as const;
