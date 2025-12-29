import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service';
import { success, error } from '../utils/response';

const service = new AuthService();

export async function registerUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await service.register(req.body);
    return success(reply, 201, 'User registered successfully', result);
  } catch (err: any) {
    return error(reply, 400, err.message);
  }
}

export async function loginUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await service.login(req.body);
    return success(reply, 200, 'Login successful', result);
  } catch (err: any) {
    return error(reply, 400, err.message);
  }
}

export async function getProfile(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return error(reply, 401, 'User authentication required');
    }

    const result = await service.getProfile(userId);
    return success(reply, 200, 'Profile retrieved successfully', result);
  } catch (err: any) {
    return error(reply, 400, err.message);
  }
}
