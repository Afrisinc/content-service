import { runNewsletterDigest } from '@/controllers/newsletterDigest.controller';
import { authGuard } from '@/middlewares/authGuard';
import { RunNewsletterDigestSchema } from '@/schemas/requests/newsletterDigest.schema';
import { FastifyInstance } from 'fastify';

/** Manual counterpart to the 06:30 cron job — the same service, on demand. */
export async function newsletterDigestRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/newsletter/digest/run',
    { schema: RunNewsletterDigestSchema, onRequest: [authGuard] },
    runNewsletterDigest
  );
}
