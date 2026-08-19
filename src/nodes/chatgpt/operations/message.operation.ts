import type OpenAI from 'openai';
import type { INodeExecutionContext, INodeItem } from '../../core';
import { CHATGPT_OPERATION, CHATGPT_RESOURCE } from '../chatgpt.constants';
import type { IChatGptClient } from '../chatgpt.types';
import {
  applyChatOptions,
  asJson,
  failOperation,
  messageContent,
  outputItem,
  parseJsonReply,
  simplifiedChat,
  type ChatOptions,
} from './shared';

type Message = OpenAI.ChatCompletionMessageParam;

const ROLES = ['system', 'user', 'assistant', 'developer'];

function toHistory(value: unknown, itemIndex: number): Message[] {
  if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return [];
  }

  if (!Array.isArray(value)) {
    return failOperation('"messages" must be an array of { role, content } objects', itemIndex);
  }

  return value.map(entry => {
    const turn = entry as { role?: string; content?: string };
    if (!turn?.role || !ROLES.includes(turn.role) || typeof turn.content !== 'string') {
      return failOperation(
        `"messages" entries need a content string and a role of ${ROLES.join(', ')}`,
        itemIndex
      );
    }
    return { role: turn.role, content: turn.content } as Message;
  });
}

export function buildMessages(context: INodeExecutionContext): Message[] {
  const itemIndex = context.getItemIndex();
  const systemPrompt = context.getNodeParameter<string>('systemPrompt', '');
  const prompt = context.getNodeParameter<string>('prompt');
  const messages: Message[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push(...toHistory(context.getNodeParameter('messages', []), itemIndex));
  messages.push({ role: 'user', content: prompt });

  return messages;
}

export function buildChatBody(
  context: INodeExecutionContext
): OpenAI.ChatCompletionCreateParamsNonStreaming {
  const jsonOutput = context.getNodeParameter<boolean>('jsonOutput', false);

  return {
    model: context.getNodeParameter<string>('model'),
    messages: buildMessages(context),
    ...applyChatOptions(context.getNodeParameter<ChatOptions>('options', {})),
    ...(jsonOutput ? { response_format: { type: 'json_object' as const } } : {}),
  };
}

export async function executeMessage(
  client: IChatGptClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const completion = await client.chat(buildChatBody(context), context.signal);
  const base = {
    resource: CHATGPT_RESOURCE.TEXT,
    operation: CHATGPT_OPERATION.MESSAGE,
    model: completion.model,
  };

  if (!context.getNodeParameter<boolean>('simplifyOutput', true)) {
    return outputItem({ ...base, response: asJson(completion) });
  }

  const simplified = simplifiedChat(completion);

  if (context.getNodeParameter<boolean>('jsonOutput', false)) {
    const parsed = parseJsonReply(messageContent(completion), context.getItemIndex());
    return outputItem({ ...base, ...simplified, parsed });
  }

  return outputItem({ ...base, ...simplified });
}

export async function* streamMessage(
  client: IChatGptClient,
  context: INodeExecutionContext
): AsyncGenerator<string, void, unknown> {
  const stream = await client.chatStream(
    { ...buildChatBody(context), stream: true },
    context.signal
  );

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}
