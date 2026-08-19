import type { INodeExecutionContext, INodeItem } from '../../core';
import { CHATGPT_OPERATION, CHATGPT_RESOURCE } from '../chatgpt.constants';
import type { IChatGptClient } from '../chatgpt.types';
import { asJson, outputItem } from './shared';

export async function executeClassify(
  client: IChatGptClient,
  context: INodeExecutionContext
): Promise<INodeItem[]> {
  const response = await client.moderate(
    {
      model: context.getNodeParameter<string>('model'),
      input: context.getNodeParameter<string>('input'),
    },
    context.signal
  );

  const result = response.results[0];

  return outputItem({
    resource: CHATGPT_RESOURCE.TEXT,
    operation: CHATGPT_OPERATION.CLASSIFY,
    model: response.model,
    flagged: result?.flagged ?? false,
    categories: asJson(result?.categories),
    categoryScores: asJson(result?.category_scores),
  });
}
