import axios from 'axios';
import { nodeServices } from '@/adapters/nodes/nodeServices';
import { runChatGpt } from '@/nodes';
import { resolveChatGptConfig } from '@/services/aiCredentials.service';
import { logger } from '@/utils/logger';

const DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export interface DrawCoverOptions {
  prompt: string;
  defaultModel: string;
  size: string;
  quality: string;
  requestId: string;
  userId?: string;
}

export async function drawCoverImage(options: DrawCoverOptions): Promise<Buffer> {
  const { credentials, model } = await resolveChatGptConfig('image');
  const items = await runChatGpt({
    credentials,
    logger,
    services: nodeServices,
    usageContext: { requestId: options.requestId, userId: options.userId },
    parameters: {
      resource: 'image',
      operation: 'generate',
      model: model ?? options.defaultModel,
      prompt: options.prompt,
      options: { size: options.size, quality: options.quality },
    },
  });

  const images = items[0]?.json?.images as
    { b64Json?: string | null; url?: string | null }[] | undefined;
  const image = images?.[0];

  if (image?.b64Json) {
    return Buffer.from(image.b64Json, 'base64');
  }
  if (image?.url) {
    const download = await axios.get<ArrayBuffer>(image.url, {
      responseType: 'arraybuffer',
      timeout: DOWNLOAD_TIMEOUT_MS,
      maxContentLength: MAX_IMAGE_BYTES,
    });
    return Buffer.from(download.data);
  }
  throw new Error('the image model returned no cover');
}
