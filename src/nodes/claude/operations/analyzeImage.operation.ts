import type Anthropic from '@anthropic-ai/sdk';
import type { INodeExecutionContext, INodeItem } from '../../core';
import { CLAUDE_OPERATION, CLAUDE_RESOURCE } from '../claude.constants';
import type { IClaudeClient } from '../claude.types';
import {
  asJson,
  buildMessageBody,
  fail,
  outputItem,
  simplifiedMessage,
  toStringArray,
} from './shared';

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

const DATA_URI = /^data:([^;,]+);base64,(.+)$/;

/** A data URI carries the bytes inline; anything else is handed to the API as a URL. */
function toImageBlock(source: string, itemIndex: number): ContentBlock {
  const match = DATA_URI.exec(source);

  if (!match) {
    if (!/^https?:\/\//.test(source)) {
      return fail(`"imageUrls" entries must be an http(s) URL or a base64 data URI`, itemIndex);
    }
    return { type: 'image', source: { type: 'url', url: source } };
  }

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: match[1] as Anthropic.Beta.BetaBase64ImageSource['media_type'],
      data: match[2],
    },
  };
}

export async function executeAnalyzeImage(
  client: IClaudeClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const itemIndex = context.getItemIndex();
  const sources = toStringArray(context.getNodeParameter('imageUrls'), 'imageUrls', itemIndex);

  // Images first: Claude answers about content it has already read.
  const content: ContentBlock[] = [
    ...sources.map(source => toImageBlock(source, itemIndex)),
    { type: 'text', text: context.getNodeParameter<string>('prompt') },
  ];

  const message = await client.message(
    buildMessageBody(context, { messages: [{ role: 'user', content }] }),
    context.signal
  );

  const base = {
    resource: CLAUDE_RESOURCE.IMAGE,
    operation: CLAUDE_OPERATION.ANALYZE,
    model: message.model,
    imageCount: sources.length,
  };

  return context.getNodeParameter<boolean>('simplifyOutput', true)
    ? outputItem({ ...base, ...simplifiedMessage(message) })
    : outputItem({ ...base, response: asJson(message) });
}
