import { RegisterRequestSchema, LoginRequestSchema } from '../requests/auth.schema';
import { RegisterResponseSchema, LoginResponseSchema, ProfileResponseSchema } from '../responses/auth.schema';
import { ErrorResponseSchema } from '../responses/common.schema';

export const RegisterRouteSchema = {
  tags: ['auth'],
  summary: 'Register a new user',
  description: 'Create a new user account with email and password',
  body: RegisterRequestSchema,
  response: {
    201: RegisterResponseSchema,
    400: ErrorResponseSchema,
  },
} as const;

export const LoginRouteSchema = {
  tags: ['auth'],
  summary: 'Login user',
  description: 'Authenticate user with email and password, returns JWT token',
  body: LoginRequestSchema,
  response: {
    200: LoginResponseSchema,
    400: ErrorResponseSchema,
  },
} as const;

export const GetProfileRouteSchema = {
  tags: ['auth'],
  summary: 'Get user profile',
  description: 'Retrieve authenticated user profile information',
  security: [{ bearerAuth: [] }],
  response: {
    200: ProfileResponseSchema,
    401: ErrorResponseSchema,
  },
} as const;
