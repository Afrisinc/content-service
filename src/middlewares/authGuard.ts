import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { logger } from '@/utils/logger.js';

interface JwtPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email?: string;
    };
  }
}

export const authGuard = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      logger.warn(
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          path: request.url,
        },
        'Authorization header missing'
      );
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Authorization header is required',
      });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      logger.warn(
        {
          ip: request.ip,
          path: request.url,
        },
        'Bearer token missing'
      );
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Bearer token is required',
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      logger.error('JWT_SECRET environment variable not configured');
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Server configuration error',
      });
    }

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    // Attach user info to request object
    request.user = {
      userId: decoded.userId,
      email: decoded.email,
    };

    logger.debug(
      {
        userId: decoded.userId,
        email: decoded.email,
        path: request.url,
      },
      'User authenticated successfully'
    );
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.warn(
        {
          ip: request.ip,
          path: request.url,
          expiredAt: error.expiredAt,
        },
        'JWT token expired'
      );
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Token has expired',
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      logger.warn(
        {
          ip: request.ip,
          path: request.url,
          error: error.message,
        },
        'Invalid JWT token'
      );
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }

    logger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        ip: request.ip,
        path: request.url,
      },
      'Auth guard error'
    );

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Authentication failed',
    });
  }
};

export const optionalAuthGuard = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return; // Continue without authentication
  }

  try {
    await authGuard(request, reply);
  } catch (error) {
    // For optional auth, we don't block the request on auth failure
    logger.debug(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: request.ip,
        path: request.url,
      },
      'Optional auth failed, continuing without authentication'
    );
  }
};
