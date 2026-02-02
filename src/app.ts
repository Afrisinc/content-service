import Fastify from 'fastify';
import { registerRoutes } from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { registerCors, registerSwagger } from './plugins';

const createApp = async () => {
  const app = Fastify({ logger: true });

  // Register CORS plugin
  await registerCors(app);

  // Register Swagger documentation plugin
  await registerSwagger(app);

  app.setErrorHandler(errorHandler);

  await registerRoutes(app);

  return app;
};

export { createApp };
