import type Anthropic from '@anthropic-ai/sdk';
import {
  asJson,
  nodeHelpers,
  outputItem,
  type INodeExecutionContext,
  type JsonObject,
} from '../../core';
import { CLAUDE_NODE_NAME, REFUSAL_FALLBACK_BETA } from '../claude.constants';
import type { ClaudeUsage } from '../claude.types';

const { fail, toStringArray } = nodeHelpers(CLAUDE_NODE_NAME);

export { asJson, outputItem, fail, toStringArray };

export interface ClaudeOptions {
  thinking?: 'adaptive' | 'disabled';
  thinkingDisplay?: 'summarized' | 'omitted';
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  stopSequences?: string[];
  cachePrompt?: boolean;
  temperature?: number;
  topP?: number;
  userId?: string;
}

export interface BodyParts {
  messages: Anthropic.Beta.BetaMessageParam[];
  system?: string;
  format?: Anthropic.Beta.BetaJSONOutputFormat;
  maxTokens?: number;
  tools?: Anthropic.Beta.BetaToolUnion[];
  container?: Anthropic.Beta.BetaContainerParams;
  betas?: string[];
}

function thinkingConfig(
  options: ClaudeOptions
): Anthropic.Beta.BetaThinkingConfigParam | undefined {
  if (options.thinking === 'disabled') {
    return { type: 'disabled' };
  }
  if (options.thinking === 'adaptive') {
    return {
      type: 'adaptive',
      ...(options.thinkingDisplay ? { display: options.thinkingDisplay } : {}),
    };
  }
  return undefined;
}

/**
 * Builds one request for every operation. Nothing the caller left unset is sent, which
 * matters here: sampling parameters and an explicit thinking config are rejected outright
 * by the current models, and omitting `effort` already means `high`.
 */
export function buildMessageBody(
  context: INodeExecutionContext,
  parts: BodyParts
): Anthropic.Beta.MessageCreateParamsNonStreaming {
  const options = context.getNodeParameter<ClaudeOptions>('options', {});
  const thinking = thinkingConfig(options);
  const withFallback = context.getNodeParameter<boolean>('refusalFallback', true);
  const model = context.getNodeParameter<string>('model');
  const betas = [...(parts.betas ?? []), ...(withFallback ? [REFUSAL_FALLBACK_BETA] : [])];
  const outputConfig: Anthropic.Beta.BetaOutputConfig = {
    ...(options.effort ? { effort: options.effort } : {}),
    ...(parts.format ? { format: parts.format } : {}),
  };

  // Fallbacks are only supported on opus and fable models, not on sonnet or haiku.
  const supportsFallbacks = model.includes('opus') || model.includes('fable');

  return {
    model,
    max_tokens: parts.maxTokens ?? context.getNodeParameter<number>('maxTokens'),
    messages: parts.messages,
    ...(parts.system ? { system: parts.system } : {}),
    ...(thinking ? { thinking } : {}),
    ...(Object.keys(outputConfig).length > 0 ? { output_config: outputConfig } : {}),
    ...(options.stopSequences?.length ? { stop_sequences: options.stopSequences } : {}),
    ...(options.cachePrompt ? { cache_control: { type: 'ephemeral' as const } } : {}),
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...(options.topP !== undefined ? { top_p: options.topP } : {}),
    ...(options.userId ? { metadata: { user_id: options.userId } } : {}),
    ...(parts.tools ? { tools: parts.tools } : {}),
    ...(parts.container ? { container: parts.container } : {}),
    ...(betas.length > 0 ? { betas } : {}),
    ...(withFallback && supportsFallbacks ? { fallbacks: 'default' as const } : {}),
  };
}

export function textFrom(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
    .map(block => block.text)
    .join('');
}

function thinkingFrom(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((block): block is Anthropic.Beta.BetaThinkingBlock => block.type === 'thinking')
    .map(block => block.thinking)
    .join('');
}

export function toUsage(usage: Anthropic.Beta.BetaUsage): ClaudeUsage {
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    thinkingTokens: usage.output_tokens_details?.thinking_tokens ?? 0,
    // Every billed bucket, so a cost calculation can start from one number if it wants to.
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
  };
}

/**
 * A safety decline is a real outcome, not a transport failure: it comes back as HTTP 200
 * with empty content. It is surfaced as `refused` on the item rather than thrown, so a
 * batch is not lost, and callers can branch on it.
 */
export function simplifiedMessage(message: Anthropic.Beta.BetaMessage): JsonObject {
  const details = message.stop_details;

  return {
    id: message.id,
    model: message.model,
    content: textFrom(message),
    thinking: thinkingFrom(message) || null,
    stopReason: message.stop_reason,
    refused: message.stop_reason === 'refusal',
    refusalCategory: details && 'category' in details ? (details.category ?? null) : null,
    servedByFallback: (message.usage.iterations ?? []).some(
      entry => entry.type === 'fallback_message'
    ),
    usage: toUsage(message.usage),
  };
}

export function parseStructured(
  message: Anthropic.Beta.BetaMessage,
  itemIndex: number
): JsonObject {
  const text = textFrom(message);

  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return fail('Claude did not return valid JSON', itemIndex, text.slice(0, 200));
  }
}
