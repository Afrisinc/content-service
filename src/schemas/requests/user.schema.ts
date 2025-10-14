export const UpdateUserRequestSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Updated user display name',
    },
  },
  additionalProperties: false,
} as const;

export const UserParamsSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'User unique identifier',
    },
  },
  required: ['id'],
} as const;
