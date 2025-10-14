import { PrismaClient } from '@prisma/client';
import { dbLogger } from '@/utils/logger.js';

// Global Prisma instance for development
declare global {
  var __prisma: PrismaClient | undefined;
}

// Prisma client configuration
const prismaConfig = {
  log: [
    {
      emit: 'event' as const,
      level: 'query' as const,
    },
    {
      emit: 'event' as const,
      level: 'error' as const,
    },
    {
      emit: 'event' as const,
      level: 'info' as const,
    },
    {
      emit: 'event' as const,
      level: 'warn' as const,
    },
  ],
  // Connection pool settings
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
};

// Create Prisma client with singleton pattern for development
function createPrismaClient(): PrismaClient {
  const prisma = new PrismaClient(prismaConfig);

  // Log queries in development
  if (process.env.NODE_ENV !== 'production') {
    prisma.$on('query', e => {
      dbLogger.debug(
        {
          query: e.query,
          params: e.params,
          duration: e.duration,
          target: e.target,
        },
        'Query executed'
      );
    });
  }

  // Log errors
  prisma.$on('error', e => {
    dbLogger.error(
      {
        message: e.message,
        target: e.target,
      },
      'Database error'
    );
  });

  // Log info messages
  prisma.$on('info', e => {
    dbLogger.info(
      {
        message: e.message,
        target: e.target,
      },
      'Database info'
    );
  });

  // Log warnings
  prisma.$on('warn', e => {
    dbLogger.warn(
      {
        message: e.message,
        target: e.target,
      },
      'Database warning'
    );
  });

  return prisma;
}

// Singleton pattern: reuse connection in development to avoid too many connections
const prisma = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// Connection management functions
export async function connectToDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    dbLogger.info(
      {
        database: 'postgresql',
        environment: process.env.NODE_ENV || 'development',
      },
      'Database connected successfully'
    );

    // Test the connection
    await prisma.$queryRaw`SELECT 1`;
    dbLogger.debug('Database connection test passed');
  } catch (error) {
    dbLogger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to connect to database'
    );
    throw new Error('Database connection failed');
  }
}

export async function disconnectFromDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    dbLogger.info('Database disconnected successfully');
  } catch (error) {
    dbLogger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Error disconnecting from database'
    );
  }
}

// Health check function
export async function checkDatabaseConnection(): Promise<{
  isConnected: boolean;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;

    dbLogger.debug({ responseTime }, 'Database health check passed');

    return {
      isConnected: true,
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown database error';

    dbLogger.error(
      {
        error: errorMessage,
        responseTime,
      },
      'Database health check failed'
    );

    return {
      isConnected: false,
      responseTime,
      error: errorMessage,
    };
  }
}

// Get connection info
export async function getDatabaseInfo(): Promise<{
  version: string;
  maxConnections: number;
  activeConnections: number;
}> {
  try {
    const versionResult = await prisma.$queryRaw<
      Array<{ version: string }>
    >`SELECT version()`;
    const version = versionResult[0]?.version || 'Unknown';

    // Get connection stats
    const connectionStats = await prisma.$queryRaw<
      Array<{
        setting: string;
        max_connections: number;
        active_connections: number;
      }>
    >`
      SELECT
        'max_connections' as setting,
        COALESCE((SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 0) as max_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
    `;

    const stats = connectionStats[0];

    dbLogger.debug(
      {
        version: version.split(' ')[0], // Just the version number
        maxConnections: stats?.max_connections || 0,
        activeConnections: stats?.active_connections || 0,
      },
      'Database info retrieved'
    );

    return {
      version: version.split(' ')[0],
      maxConnections: stats?.max_connections || 0,
      activeConnections: stats?.active_connections || 0,
    };
  } catch (error) {
    dbLogger.warn(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Could not retrieve database info'
    );

    return {
      version: 'Unknown',
      maxConnections: 0,
      activeConnections: 0,
    };
  }
}

// Database transaction helper
export async function withTransaction<T>(
  operation: (
    prisma: Omit<
      PrismaClient,
      '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
    >
  ) => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await prisma.$transaction(async tx => {
      return await operation(tx);
    });

    const duration = Date.now() - startTime;
    dbLogger.debug({ duration }, 'Transaction completed successfully');

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    dbLogger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      },
      'Transaction failed'
    );
    throw error;
  }
}

// Graceful shutdown helper
export async function gracefulShutdown(): Promise<void> {
  dbLogger.info('Starting graceful database shutdown');

  try {
    // Wait for ongoing operations to complete (you can implement your own logic here)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Disconnect from database
    await disconnectFromDatabase();

    dbLogger.info('Graceful database shutdown completed');
  } catch (error) {
    dbLogger.error(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Error during graceful database shutdown'
    );
  }
}

export default prisma;
