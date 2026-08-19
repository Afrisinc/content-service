import type Anthropic from '@anthropic-ai/sdk';
import type { INodeExecutionContext, INodeItem } from '../../core';
import { CLASSIFY_MAX_TOKENS, CLAUDE_OPERATION, CLAUDE_RESOURCE } from '../claude.constants';
import type { IClaudeClient } from '../claude.types';
import {
  buildMessageBody,
  outputItem,
  parseStructured,
  simplifiedMessage,
  toStringArray,
} from './shared';

const SYSTEM_PROMPT =
  'You are a precise text classifier. Choose exactly one of the categories you are given. ' +
  'Answer only with the requested JSON object.';

/** A schema, not a parsing convention, is what makes the reply reliably machine-readable. */
function schemaFor(categories: string[]): Anthropic.Beta.BetaJSONOutputFormat {
  return {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: categories },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reasoning: { type: 'string' },
      },
      required: ['category', 'confidence', 'reasoning'],
      additionalProperties: false,
    },
  };
}

export async function executeClassify(
  client: IClaudeClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const itemIndex = context.getItemIndex();
  const categories = toStringArray(context.getNodeParameter('categories'), 'categories', itemIndex);
  const input = context.getNodeParameter<string>('input');

  const body = buildMessageBody(context, {
    messages: [
      {
        role: 'user',
        content: `Categories: ${categories.join(', ')}\n\nText to classify:\n${input}`,
      },
    ],
    system: SYSTEM_PROMPT,
    format: schemaFor(categories),
    maxTokens: CLASSIFY_MAX_TOKENS,
  });

  const message = await client.message(body, context.signal);
  const simplified = simplifiedMessage(message);

  if (simplified.refused) {
    return outputItem({
      resource: CLAUDE_RESOURCE.TEXT,
      operation: CLAUDE_OPERATION.CLASSIFY,
      ...simplified,
    });
  }

  const parsed = parseStructured(message, itemIndex);

  return outputItem({
    resource: CLAUDE_RESOURCE.TEXT,
    operation: CLAUDE_OPERATION.CLASSIFY,
    model: message.model,
    category: parsed.category ?? null,
    confidence: parsed.confidence ?? null,
    reasoning: parsed.reasoning ?? null,
    usage: simplified.usage,
  });
}
