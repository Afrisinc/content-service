import { UserPublicSchema } from '../entities/user.schema';

export const AuthDataSchema = {
  type: 'object',
  properties: {
    user: UserPublicSchema,
    token: {
      type: 'string',
      description: 'JWT authentication token',
    },
  },
  required: ['user', 'token'],
} as const;

export const RegisterResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'User registered successfully' },
    data: AuthDataSchema,
  },
  required: ['success', 'message', 'data'],
} as const;

export const LoginResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string', example: 'Login successful' },
    data: AuthDataSchema,
  },
  required: ['success', 'message', 'data'],
} as const;
