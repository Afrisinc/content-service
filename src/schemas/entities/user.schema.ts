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

export const SocialMediaAccountSchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      description: 'Unique identifier for the account',
    },
    platform: {
      type: 'string',
      enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
      description: 'Social media platform name',
    },
    pageId: {
      type: 'string',
      description: 'Page or account ID on the platform',
    },
    pageName: {
      type: 'string',
      description: 'Page or account name on the platform',
    },
    isActive: {
      type: 'boolean',
      description: 'Whether the account is currently active',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
      description: 'When the account was connected',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
      description: 'Last update timestamp',
    },
  },
  required: ['id', 'platform', 'pageId', 'isActive', 'createdAt'],
} as const;

export const UserPublicSchema = {
  type: 'object',
  properties: {
    id: UserEntitySchema.properties.id,
    email: UserEntitySchema.properties.email,
    name: UserEntitySchema.properties.name,
    createdAt: UserEntitySchema.properties.createdAt,
    updatedAt: {
      type: 'string',
      format: 'date-time',
      description: 'Account update timestamp',
    },
    socialAccounts: {
      type: 'array',
      items: SocialMediaAccountSchema,
      description: 'Connected social media accounts',
    },
  },
  required: ['id', 'email', 'createdAt'],
} as const;
