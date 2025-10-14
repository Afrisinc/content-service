import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '@/utils/logger.js';

// Custom error types
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    code?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, true, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed') {
    super(message, 401, true, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, true, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, true, 'NOT_FOUND_ERROR');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, true, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, true, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}

// Error response interface
interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  code?: string;
  details?: any;
  timestamp: string;
  path: string;
  requestId?: string;
}

// Helper function to determine if error should be logged
const shouldLogError = (statusCode: number): boolean => {
  return statusCode >= 500;
};

// Helper function to sanitize error for client
const sanitizeError = (error: any, statusCode: number) => {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // In production, don't expose internal error details for 5xx errors
  if (!isDevelopment && statusCode >= 500) {
    return {
      message: 'Internal Server Error',
      details: undefined,
    };
  }

  return {
    message: error.message || 'An error occurred',
    details: error.details || undefined,
  };
};

export const errorHandler = (
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  let statusCode = 500;
  let errorCode: string | undefined;
  let message = 'Internal Server Error';
  let details: any;

  // Handle different error types
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
    errorCode = error.code;
  } else if (error instanceof ZodError) {
    // Zod validation errors
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // Prisma database errors
    statusCode = 400;
    errorCode = 'DATABASE_ERROR';

    switch (error.code) {
      case 'P2002':
        statusCode = 409;
        message = 'Resource already exists';
        errorCode = 'UNIQUE_CONSTRAINT_ERROR';
        break;
      case 'P2025':
        statusCode = 404;
        message = 'Resource not found';
        errorCode = 'NOT_FOUND_ERROR';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Foreign key constraint failed';
        errorCode = 'FOREIGN_KEY_ERROR';
        break;
      default:
        statusCode = 500;
        message = 'Database operation failed';
    }
  } else if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    statusCode = 500;
    errorCode = 'DATABASE_ERROR';
    message = 'Unknown database error';
  } else if (error instanceof Prisma.PrismaClientRustPanicError) {
    statusCode = 500;
    errorCode = 'DATABASE_ERROR';
    message = 'Database engine error';
  } else if (error instanceof Prisma.PrismaClientInitializationError) {
    statusCode = 500;
    errorCode = 'DATABASE_CONNECTION_ERROR';
    message = 'Database connection failed';
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    errorCode = 'DATABASE_VALIDATION_ERROR';
    message = 'Database validation failed';
  } else if ('statusCode' in error && typeof error.statusCode === 'number') {
    // Fastify errors
    statusCode = error.statusCode;
    message = error.message || 'Request failed';
  } else {
    // Generic errors
    statusCode = 500;
    message = error.message || 'Internal Server Error';
  }

  // Sanitize error for client
  const sanitized = sanitizeError({ message, details }, statusCode);

  // Log error if it's a server error
  if (shouldLogError(statusCode)) {
    logger.error(
      {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: errorCode,
        },
        request: {
          method: request.method,
          url: request.url,
          headers: request.headers,
          params: request.params,
          query: request.query,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        statusCode,
        timestamp: new Date().toISOString(),
      },
      `${error.name || 'Error'}: ${error.message}`
    );
  } else {
    // Log as warning for client errors (4xx)
    logger.warn(
      {
        error: {
          name: error.name,
          message: error.message,
          code: errorCode,
        },
        request: {
          method: request.method,
          url: request.url,
          ip: request.ip,
        },
        statusCode,
        timestamp: new Date().toISOString(),
      },
      `${error.name || 'Client Error'}: ${error.message}`
    );
  }

  // Create error response
  const errorResponse: ErrorResponse = {
    error: getErrorName(statusCode),
    message: sanitized.message,
    statusCode,
    timestamp: new Date().toISOString(),
    path: request.url,
    ...(errorCode && { code: errorCode }),
    ...(sanitized.details && { details: sanitized.details }),
  };

  // Send error response
  reply.code(statusCode).send(errorResponse);
};

// Helper function to get error name from status code
function getErrorName(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable Entity';
    case 429:
      return 'Too Many Requests';
    case 500:
      return 'Internal Server Error';
    case 502:
      return 'Bad Gateway';
    case 503:
      return 'Service Unavailable';
    case 504:
      return 'Gateway Timeout';
    default:
      return 'Error';
  }
}

// Helper function to create standardized errors
export const createError = {
  badRequest: (message: string, details?: any) =>
    new ValidationError(message, details),
  unauthorized: (message?: string) => new AuthenticationError(message),
  forbidden: (message?: string) => new AuthorizationError(message),
  notFound: (message?: string) => new NotFoundError(message),
  conflict: (message?: string) => new ConflictError(message),
  internal: (message?: string) =>
    new AppError(message || 'Internal Server Error', 500),
  database: (message?: string) => new DatabaseError(message),
};
