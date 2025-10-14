export const RegisterRequestSchema = {
  type: 'object',
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'User email address for registration',
    },
    password: {
      type: 'string',
      minLength: 6,
      description: 'User password (minimum 6 characters)',
    },
    name: {
      type: 'string',
      description: 'User display name (optional)',
    },
  },
  required: ['email', 'password'],
  additionalProperties: false,
} as const;

export const LoginRequestSchema = {
  type: 'object',
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'User email address for login',
    },
    password: {
      type: 'string',
      description: 'User password',
    },
  },
  required: ['email', 'password'],
  additionalProperties: false,
} as const;
