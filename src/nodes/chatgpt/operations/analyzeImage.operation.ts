import type OpenAI from 'openai';
import type { INodeExecutionContext, INodeItem } from '../../core';
import { CHATGPT_OPERATION, CHATGPT_RESOURCE } from '../chatgpt.constants';
import type { IChatGptClient } from '../chatgpt.types';
import {
  applyChatOptions,
  asJson,
  outputItem,
  simplifiedChat,
  toStringArray,
  type ChatOptions,
} from './shared';

type ContentPart = OpenAI.ChatCompletionContentPart;

export async function executeAnalyzeImage(
  client: IChatGptClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const itemIndex = context.getItemIndex();
  const options = context.getNodeParameter<ChatOptions>('options', {});
  const urls = toStringArray(context.getNodeParameter('imageUrls'), 'imageUrls', itemIndex);

  const content: ContentPart[] = [
    { type: 'text', text: context.getNodeParameter<string>('prompt') },
    ...urls.map(
      url =>
        ({
          type: 'image_url',
          image_url: { url, ...(options.detail ? { detail: options.detail } : {}) },
        }) as ContentPart
    ),
  ];

  const completion = await client.chat(
    {
      model: context.getNodeParameter<string>('model'),
      messages: [{ role: 'user', content }],
      ...applyChatOptions(options),
    },
    context.signal
  );

  const base = {
    resource: CHATGPT_RESOURCE.IMAGE,
    operation: CHATGPT_OPERATION.ANALYZE,
    model: completion.model,
    imageCount: urls.length,
  };

  return context.getNodeParameter<boolean>('simplifyOutput', true)
    ? outputItem({ ...base, ...simplifiedChat(completion) })
    : outputItem({ ...base, response: asJson(completion) });
}
