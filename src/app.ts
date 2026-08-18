import Fastify from 'fastify';
import { registerRoutes } from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { registerCors, registerSwagger, registerGatewayGuard } from './plugins';

const createApp = async () => {
  const app = Fastify({
    logger: true,
    bodyLimit: 536870912, // 512MB limit for base64 image uploads
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'req_id',
    disableRequestLogging: false,
  });

  await registerCors(app);
  await registerSwagger(app);
  await registerGatewayGuard(app);

  app.setErrorHandler(errorHandler);

  await registerRoutes(app);

  return app;
};

export { createApp };
