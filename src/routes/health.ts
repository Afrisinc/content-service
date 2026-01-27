import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { healthLogger } from '@/utils/logger.js';

// Health check response interfaces
interface BasicHealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
}

interface DetailedHealthResponse extends BasicHealthResponse {
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    memory: {
      status: 'healthy' | 'warning' | 'critical';
      usage: {
        used: number;
        total: number;
        percentage: number;
      };
    };
    disk: {
      status: 'healthy' | 'warning' | 'critical';
      usage?: {
        used: number;
        total: number;
        percentage: number;
      };
    };
  };
  metrics: {
    requestCount?: number;
    errorRate?: number;
    averageResponseTime?: number;
  };
}

// Simple in-memory metrics store
class MetricsStore {
  private requestCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];
  private startTime = Date.now();

  incrementRequest() {
    this.requestCount++;
  }

  incrementError() {
    this.errorCount++;
  }

  addResponseTime(time: number) {
    this.responseTimes.push(time);
    // Keep only last 100 response times
    if (this.responseTimes.length > 100) {
      this.responseTimes = this.responseTimes.slice(-100);
    }
  }

  getMetrics() {
    const averageResponseTime =
      this.responseTimes.length > 0 ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length : 0;

    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;

    return {
      requestCount: this.requestCount,
      errorRate: Math.round(errorRate * 100) / 100,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      uptime: Date.now() - this.startTime,
    };
  }

  reset() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.responseTimes = [];
    this.startTime = Date.now();
  }
}

const metricsStore = new MetricsStore();

// Health check functions
async function checkDatabase(prisma: PrismaClient): Promise<{
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
}> {
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;

    healthLogger.debug({ responseTime }, 'Database health check passed');

    return {
      status: 'healthy',
      responseTime,
    };
  } catch (error) {
    healthLogger.error({ error }, 'Database health check failed');
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown database error',
    };
  }
}

function checkMemory(): {
  status: 'healthy' | 'warning' | 'critical';
  usage: { used: number; total: number; percentage: number };
} {
  const memoryUsage = process.memoryUsage();
  const totalMemory = memoryUsage.heapTotal;
  const usedMemory = memoryUsage.heapUsed;
  const percentage = (usedMemory / totalMemory) * 100;

  let status: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (percentage > 90) {
    status = 'critical';
  } else if (percentage > 75) {
    status = 'warning';
  }

  return {
    status,
    usage: {
      used: Math.round((usedMemory / 1024 / 1024) * 100) / 100, // MB
      total: Math.round((totalMemory / 1024 / 1024) * 100) / 100, // MB
      percentage: Math.round(percentage * 100) / 100,
    },
  };
}

function checkDisk(): {
  status: 'healthy' | 'warning' | 'critical';
  usage?: { used: number; total: number; percentage: number };
} {
  // Simplified disk check - in a real application, you might want to use a library like 'node-disk-info'
  // For now, we'll just return healthy as we don't have disk usage info
  return {
    status: 'healthy',
  };
}

// Middleware to track metrics
export function metricsMiddleware() {
  return async function (request: any, reply: any) {
    const startTime = Date.now();

    metricsStore.incrementRequest();

    reply.addHook('onSend', async () => {
      const responseTime = Date.now() - startTime;
      metricsStore.addResponseTime(responseTime);

      if (reply.statusCode >= 400) {
        metricsStore.incrementError();
      }
    });
  };
}

export default async function healthRoutes(fastify: FastifyInstance) {
  const prisma = new PrismaClient();

  // Basic health check - lightweight endpoint for load balancers
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Basic health check endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'unhealthy'] },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, _reply): Promise<BasicHealthResponse> => {
      const response: BasicHealthResponse = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
      };

      healthLogger.debug(
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        'Basic health check requested'
      );

      return response;
    }
  );

  // Detailed health check with metrics
  fastify.get(
    '/health/detailed',
    {
      schema: {
        description: 'Detailed health check with system metrics',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'unhealthy'] },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
              checks: {
                type: 'object',
                properties: {
                  database: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      responseTime: { type: 'number' },
                      error: { type: 'string' },
                    },
                  },
                  memory: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      usage: {
                        type: 'object',
                        properties: {
                          used: { type: 'number' },
                          total: { type: 'number' },
                          percentage: { type: 'number' },
                        },
                      },
                    },
                  },
                  disk: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      usage: {
                        type: 'object',
                        properties: {
                          used: { type: 'number' },
                          total: { type: 'number' },
                          percentage: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
              metrics: {
                type: 'object',
                properties: {
                  requestCount: { type: 'number' },
                  errorRate: { type: 'number' },
                  averageResponseTime: { type: 'number' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              checks: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply): Promise<DetailedHealthResponse> => {
      healthLogger.debug(
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        'Detailed health check requested'
      );

      // Perform all health checks
      const [databaseCheck, memoryCheck, diskCheck] = await Promise.all([
        checkDatabase(prisma),
        Promise.resolve(checkMemory()),
        Promise.resolve(checkDisk()),
      ]);

      const metrics = metricsStore.getMetrics();

      // Determine overall health status
      const isHealthy =
        databaseCheck.status === 'healthy' && memoryCheck.status !== 'critical' && diskCheck.status !== 'critical';

      const response: DetailedHealthResponse = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        checks: {
          database: databaseCheck,
          memory: memoryCheck,
          disk: diskCheck,
        },
        metrics: {
          requestCount: metrics.requestCount,
          errorRate: metrics.errorRate,
          averageResponseTime: metrics.averageResponseTime,
        },
      };

      // Log health status
      if (!isHealthy) {
        healthLogger.warn({ response }, 'System health check failed');
        reply.code(503);
      } else {
        healthLogger.debug(
          {
            databaseResponseTime: databaseCheck.responseTime,
            memoryUsage: memoryCheck.usage.percentage,
            errorRate: metrics.errorRate,
          },
          'System health check passed'
        );
      }

      return response;
    }
  );

  // Readiness check - for Kubernetes readiness probes
  fastify.get(
    '/health/ready',
    {
      schema: {
        description: 'Readiness check for Kubernetes',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              ready: { type: 'boolean' },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              ready: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // Check if the application is ready to serve traffic
        const databaseCheck = await checkDatabase(prisma);
        const isReady = databaseCheck.status === 'healthy';

        if (!isReady) {
          healthLogger.warn({ databaseCheck }, 'Readiness check failed');
          reply.code(503);
          return {
            status: 'not ready',
            timestamp: new Date().toISOString(),
            ready: false,
            error: databaseCheck.error || 'Database not available',
          };
        }

        healthLogger.debug('Readiness check passed');
        return {
          status: 'ready',
          timestamp: new Date().toISOString(),
          ready: true,
        };
      } catch (error) {
        healthLogger.error({ error }, 'Readiness check error');
        reply.code(503);
        return {
          status: 'not ready',
          timestamp: new Date().toISOString(),
          ready: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Liveness check - for Kubernetes liveness probes
  fastify.get(
    '/health/live',
    {
      schema: {
        description: 'Liveness check for Kubernetes',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              alive: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      // Simple liveness check - if we can respond, we're alive
      healthLogger.debug('Liveness check requested');

      return {
        status: 'alive',
        timestamp: new Date().toISOString(),
        alive: true,
      };
    }
  );

  // Metrics endpoint
  fastify.get(
    '/health/metrics',
    {
      schema: {
        description: 'Application metrics endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              requestCount: { type: 'number' },
              errorRate: { type: 'number' },
              averageResponseTime: { type: 'number' },
              memory: {
                type: 'object',
                properties: {
                  used: { type: 'number' },
                  total: { type: 'number' },
                  percentage: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      const metrics = metricsStore.getMetrics();
      const memoryCheck = checkMemory();

      healthLogger.debug({ metrics }, 'Metrics requested');

      return {
        timestamp: new Date().toISOString(),
        ...metrics,
        memory: memoryCheck.usage,
      };
    }
  );

  // Metrics reset endpoint (for testing/development)
  fastify.post(
    '/health/metrics/reset',
    {
      schema: {
        description: 'Reset application metrics (development only)',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (process.env.NODE_ENV === 'production') {
        reply.code(403);
        return {
          error: 'Forbidden',
          message: 'Metrics reset not allowed in production',
        };
      }

      metricsStore.reset();
      healthLogger.info(
        {
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
        'Metrics reset requested'
      );

      return {
        message: 'Metrics reset successfully',
        timestamp: new Date().toISOString(),
      };
    }
  );

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}
