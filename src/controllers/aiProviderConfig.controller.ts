import { FastifyReply, FastifyRequest } from 'fastify';
import { ApiResponseHelper, ResponseCode } from '@/utils/apiResponse';
import { aiProviderConfigService } from '@/services/aiProviderConfig.service';
import type {
  AiProviderKey,
  AiPurposeKey,
  SaveAiProviderConfigPayload,
} from '@/types/aiProviderConfig.types';

export async function listAiProviderConfigs(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const configs = await aiProviderConfigService.list();

  return ApiResponseHelper.success(
    reply,
    'AI provider configs retrieved successfully',
    { configs },
    ResponseCode.SUCCESS,
    200
  );
}

export async function saveAiProviderConfig(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { provider, purpose } = request.params as {
    provider: AiProviderKey;
    purpose: AiPurposeKey;
  };
  const body = request.body as SaveAiProviderConfigPayload;

  const config = await aiProviderConfigService.save(provider, purpose, body, request.user!.userId);

  return ApiResponseHelper.success(
    reply,
    `${provider} ${purpose} config saved`,
    config,
    ResponseCode.UPDATED,
    200
  );
}
