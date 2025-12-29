import {
  GetProfileRouteSchema,
  LoginRouteSchema,
  RegisterRouteSchema,
} from '@/schemas';
import { FastifyInstance } from 'fastify';
import {
  getProfile,
  loginUser,
  registerUser,
} from '../controllers/auth.controller';
import { authGuard } from '../middlewares/authGuard';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', { schema: RegisterRouteSchema }, registerUser);
  app.post('/auth/login', { schema: LoginRouteSchema }, loginUser);
  app.get(
    '/auth/profile',
    { schema: GetProfileRouteSchema, onRequest: [authGuard] },
    getProfile
  );
}
