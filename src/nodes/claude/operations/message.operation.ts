import type Anthropic from '@anthropic-ai/sdk';
import type { INodeExecutionContext, INodeItem, JsonObject } from '../../core';
import { CLAUDE_OPERATION, CLAUDE_RESOURCE } from '../claude.constants';
import type { IClaudeClient } from '../claude.types';
import {
  asJson,
  buildMessageBody,
  fail,
  outputItem,
  parseStructured,
  simplifiedMessage,
} from './shared';

type Message = Anthropic.Beta.BetaMessageParam;

/** `system` is a top-level field on this API, so only these two roles belong in `messages`. */
const ROLES = ['user', 'assistant'];

function toHistory(value: unknown, itemIndex: number): Message[] {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return [];
  }

  if (!Array.isArray(value)) {
    return fail('"messages" must be an array of { role, content } objects', itemIndex);
  }

  return value.map(entry => {
    const turn = entry as { role?: string; content?: string };
    if (!turn?.role || !ROLES.includes(turn.role) || typeof turn.content !== 'string') {
      return fail(
        `"messages" entries need a content string and a role of ${ROLES.join(' or ')}`,
        itemIndex
      );
    }
    return { role: turn.role, content: turn.content } as Message;
  });
}

export function buildMessages(context: INodeExecutionContext): Message[] {
  return [
    ...toHistory(context.getNodeParameter('messages', []), context.getItemIndex()),
    { role: 'user', content: context.getNodeParameter<string>('prompt') },
  ];
}

function outputFormat(
  context: INodeExecutionContext
): Anthropic.Beta.BetaJSONOutputFormat | undefined {
  const schema = context.getNodeParameter<Record<string, unknown>>('jsonSchema', {});

  return Object.keys(schema ?? {}).length > 0 ? { type: 'json_schema', schema } : undefined;
}

export function buildBody(
  context: INodeExecutionContext
): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const systemPrompt = context.getNodeParameter<string>('systemPrompt', '');

  return buildMessageBody(context, {
    messages: buildMessages(context),
    system: systemPrompt || undefined,
    format: outputFormat(context),
  });
}

export async function executeMessage(
  client: IClaudeClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const message = await client.message(buildBody(context), context.signal);
  const base = {
    resource: CLAUDE_RESOURCE.TEXT,
    operation: CLAUDE_OPERATION.MESSAGE,
    model: message.model,
  };

  if (!context.getNodeParameter<boolean>('simplifyOutput', true)) {
    return outputItem({ ...base, response: asJson(message) });
  }

  const simplified = simplifiedMessage(message);

  if (simplified.refused) {
    context.logger.warn(
      { model: message.model, category: simplified.refusalCategory },
      '[claude] request was declined by the safety classifier'
    );
    return outputItem({ ...base, ...simplified });
  }

  const parsed: JsonObject | undefined = outputFormat(context)
    ? parseStructured(message, context.getItemIndex())
    : undefined;

  return outputItem({ ...base, ...simplified, ...(parsed ? { parsed } : {}) });
}

export async function* streamMessage(
  client: IClaudeClient,
  context: INodeExecutionContext
): AsyncGenerator<string, void, unknown> {
  const stream = await client.messageStream(
    { ...buildBody(context), stream: true },
    context.signal
  );

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}
