import { UpdateUserRequestSchema, UserParamsSchema } from '../requests/user.schema';
import { UserPublicSchema } from '../entities/user.schema';
import { SuccessResponseSchema, ErrorResponseSchema } from '../responses/common.schema';

export const GetUserRouteSchema = {
  tags: ['users'],
  summary: 'Get user profile',
  description: 'Retrieve user profile information by user ID',
  params: UserParamsSchema,
  response: {
    200: SuccessResponseSchema({
      ...UserPublicSchema,
      description: 'User profile data',
    }),
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
} as const;

export const UpdateUserRouteSchema = {
  tags: ['users'],
  summary: 'Update user profile',
  description: 'Update user profile information',
  params: UserParamsSchema,
  body: UpdateUserRequestSchema,
  response: {
    200: SuccessResponseSchema({
      ...UserPublicSchema,
      description: 'Updated user profile data',
    }),
    400: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
} as const;
