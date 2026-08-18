import { FastifyInstance } from 'fastify';
import {
  getUser,
  updateUser,
  getUserProfile,
  updateUserProfile,
} from '../controllers/user.controller';
import { GetUserRouteSchema, UpdateUserRouteSchema } from '@/schemas';
import { authGuard } from '@/middlewares/authGuard';

export async function userRoutes(app: FastifyInstance) {
  app.get('/users/profile', { preHandler: authGuard }, getUserProfile);
  app.put('/users/profile', { preHandler: authGuard }, updateUserProfile);
  app.get('/api/users/:id', { schema: GetUserRouteSchema }, getUser);
  app.put('/api/users/:id', { schema: UpdateUserRouteSchema }, updateUser);
}
