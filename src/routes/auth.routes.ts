import { FastifyInstance } from 'fastify';
import { registerUser, loginUser } from '../controllers/auth.controller';
import { RegisterRouteSchema, LoginRouteSchema } from '@/schemas';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', { schema: RegisterRouteSchema }, registerUser);
  app.post('/auth/login', { schema: LoginRouteSchema }, loginUser);
}
