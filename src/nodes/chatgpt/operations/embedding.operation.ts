import type { INodeExecutionContext, INodeItem, JsonValue } from '../../core';
import { CHATGPT_OPERATION, CHATGPT_RESOURCE } from '../chatgpt.constants';
import type { IChatGptClient } from '../chatgpt.types';
import { outputItem, toStringArray, toUsage } from './shared';

interface EmbeddingOptions {
  dimensions?: number;
  user?: string;
}

export async function executeEmbedding(
  client: IChatGptClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const model = context.getNodeParameter<string>('model');
  const options = context.getNodeParameter<EmbeddingOptions>('options', {});
  const input = toStringArray(context.getNodeParameter('input'), 'input', context.getItemIndex());

  const response = await client.createEmbeddings(
    {
      model,
      input,
      ...(options.dimensions ? { dimensions: options.dimensions } : {}),
      ...(options.user ? { user: options.user } : {}),
    },
    context.signal
  );

  const embeddings = response.data.map(entry => ({
    index: entry.index,
    dimensions: entry.embedding.length,
    vector: entry.embedding,
  })) as JsonValue;

  return outputItem({
    resource: CHATGPT_RESOURCE.EMBEDDING,
    operation: CHATGPT_OPERATION.CREATE,
    model: response.model,
    embeddings,
    usage: toUsage(response.usage),
  });
}
