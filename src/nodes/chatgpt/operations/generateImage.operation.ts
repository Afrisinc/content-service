import type OpenAI from 'openai';
import type { INodeExecutionContext, INodeItem, JsonValue } from '../../core';
import { CHATGPT_OPERATION, CHATGPT_RESOURCE } from '../chatgpt.constants';
import type { IChatGptClient } from '../chatgpt.types';
import { failOperation, outputItem } from './shared';

interface ImageOptions {
  size?: string;
  quality?: string;
  style?: string;
  numberOfImages?: number;
  responseFormat?: string;
  user?: string;
}

type ImageParams = OpenAI.ImageGenerateParamsNonStreaming;

function toBody(model: string, prompt: string, options: ImageOptions): ImageParams {
  const body: ImageParams = { model, prompt };

  if (options.size) {
    body.size = options.size as ImageParams['size'];
  }
  if (options.quality) {
    body.quality = options.quality as ImageParams['quality'];
  }
  if (options.style) {
    body.style = options.style as ImageParams['style'];
  }
  if (options.numberOfImages) {
    body.n = options.numberOfImages;
  }
  if (options.responseFormat) {
    body.response_format = options.responseFormat as ImageParams['response_format'];
  }
  if (options.user) {
    body.user = options.user;
  }

  return body;
}

export async function executeGenerateImage(
  client: IChatGptClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const model = context.getNodeParameter<string>('model');
  const response = await client.generateImages(
    toBody(model, context.getNodeParameter<string>('prompt'), {
      ...context.getNodeParameter<ImageOptions>('options', {}),
    }),
    context.signal
  );

  const generated = response.data ?? [];

  if (generated.length === 0) {
    failOperation('The image API returned no images', context.getItemIndex());
  }

  const images = generated.map(image => ({
    url: image.url ?? null,
    b64Json: image.b64_json ?? null,
    revisedPrompt: image.revised_prompt ?? null,
  })) as JsonValue;

  return outputItem({
    resource: CHATGPT_RESOURCE.IMAGE,
    operation: CHATGPT_OPERATION.GENERATE,
    model,
    images,
  });
}
