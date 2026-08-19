import { newsletterDigestService } from '@/services/newsletterDigest.service';
import { ApiResponseHelper, ResponseCode } from '@/utils/apiResponse';
import { FastifyReply, FastifyRequest } from 'fastify';

export async function runNewsletterDigest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const body = (request.body ?? {}) as { dryRun?: boolean };

  const result = await newsletterDigestService.run({ dryRun: body.dryRun === true });

  return ApiResponseHelper.success(
    reply,
    `Newsletter digest ${result.status}`,
    result,
    ResponseCode.SUCCESS,
    200
  );
}
