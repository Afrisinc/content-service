export const UserEntitySchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Unique identifier for the user',
    },
    email: {
      type: 'string',
      format: 'email',
      description: 'User email address',
    },
    name: {
      type: 'string',
      description: 'User display name',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'Account creation timestamp',
    },
  },
  required: ['id', 'email', 'createdAt'],
} as const;

export const UserPublicSchema = {
  type: 'object',
  properties: {
    id: UserEntitySchema.properties.id,
    email: UserEntitySchema.properties.email,
    name: UserEntitySchema.properties.name,
    createdAt: UserEntitySchema.properties.createdAt,
  },
  required: ['id', 'email', 'createdAt'],
} as const;
