import type OpenAI from 'openai';
import { asJson, nodeHelpers, outputItem, type JsonObject, type NodeUsage } from '../../core';
import { CHATGPT_NODE_NAME } from '../chatgpt.constants';

const { fail, toStringArray } = nodeHelpers(CHATGPT_NODE_NAME);

export { asJson, outputItem, fail as failOperation, toStringArray };

export function toUsage(usage?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
}): NodeUsage {
  const promptTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  // OpenAI reports cached tokens inside prompt_tokens; splitting them out keeps the cheaper
  // rate from being charged as fresh input.
  const cacheReadTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    inputTokens: Math.max(0, promptTokens - cacheReadTokens),
    outputTokens,
    cacheReadTokens,
    // OpenAI caches automatically and does not bill a separate write.
    cacheWriteTokens: 0,
    totalTokens: usage?.total_tokens ?? promptTokens + outputTokens,
  };
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  seed?: number;
  stop?: string[];
  user?: string;
  detail?: 'auto' | 'low' | 'high';
}

type ChatBody = Partial<OpenAI.ChatCompletionCreateParamsNonStreaming>;

/** Only the options actually set are sent; the API's own defaults cover the rest. */
export function applyChatOptions(options: ChatOptions): ChatBody {
  const body: ChatBody = {};
  const mapping: Array<[keyof ChatOptions, keyof ChatBody]> = [
    ['temperature', 'temperature'],
    ['maxTokens', 'max_tokens'],
    ['topP', 'top_p'],
    ['frequencyPenalty', 'frequency_penalty'],
    ['presencePenalty', 'presence_penalty'],
    ['seed', 'seed'],
    ['stop', 'stop'],
    ['user', 'user'],
  ];

  for (const [from, to] of mapping) {
    const value = options[from];
    if (value !== undefined && value !== '') {
      Object.assign(body, { [to]: value });
    }
  }

  return body;
}

export function messageContent(completion: OpenAI.ChatCompletion): string {
  return completion.choices[0]?.message?.content ?? '';
}

export function parseJsonReply(content: string, itemIndex: number): JsonObject {
  try {
    return JSON.parse(content) as JsonObject;
  } catch {
    return fail('The model did not return valid JSON', itemIndex, content.slice(0, 200));
  }
}

export function simplifiedChat(completion: OpenAI.ChatCompletion): JsonObject {
  const choice = completion.choices[0];

  return {
    id: completion.id,
    model: completion.model,
    content: messageContent(completion),
    role: choice?.message?.role ?? 'assistant',
    finishReason: choice?.finish_reason ?? null,
    refusal: choice?.message?.refusal ?? null,
    usage: toUsage(completion.usage),
  };
}
