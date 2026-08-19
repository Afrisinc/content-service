import { silentLogger } from './logger';
import { NodeOperationError, toErrorJson } from './node.errors';
import { buildContext, runItem, type PipelineConfig } from './execution.pipeline';
import { resolveParameters, type RawParameters } from './parameters';
import type { ILogger, INodeItem, INodeType, JsonObject } from './node.types';
import type { NodeServices } from './services.types';

export interface ExecuteNodeOptions {
  parameters: RawParameters;
  /** One execution per item; defaults to a single empty item. */
  items?: INodeItem[];
  credentials?: Record<string, JsonObject>;
  logger?: ILogger;
  /** Emit a failed item instead of rejecting, so one bad item cannot lose the batch. */
  continueOnFail?: boolean;
  signal?: AbortSignal;
  /** Memory, cache, usage and budget adapters. Every one of them is optional. */
  services?: NodeServices;
  /** Carries prior turns in and out of the conversation identified by `sessionId`. */
  memory?: { sessionId: string; limit?: number };
  /** Opt in per call — caching a non-deterministic reply is a bug, not an optimisation. */
  cache?: { ttlSeconds: number };
  /** Replays the first result for a repeated key instead of paying for the call twice. */
  idempotency?: { key: string; ttlSeconds?: number };
  usageContext?: { userId?: string; requestId?: string };
  /** Items in flight at once. Stays at 1 unless asked, so ordering surprises are opt-in. */
  concurrency?: number;
}

function assertCredentials(node: INodeType, supplied: Record<string, JsonObject>): void {
  for (const use of node.description.credentials ?? []) {
    if (use.required !== false && !supplied[use.name]) {
      throw new NodeOperationError(`Credentials "${use.name}" are required`, {
        node: node.description.name,
      });
    }
  }
}

function toConfig(
  node: INodeType,
  options: ExecuteNodeOptions,
  items: INodeItem[]
): PipelineConfig {
  return {
    node,
    items,
    parameters: options.parameters,
    credentials: options.credentials ?? {},
    services: options.services ?? {},
    memory: options.memory,
    cache: options.cache,
    idempotency: options.idempotency,
    usageContext: options.usageContext,
    continueOnFail: options.continueOnFail === true,
    logger: options.logger ?? silentLogger,
    signal: options.signal,
  };
}

/** Bounded fan-out that keeps output in input order and stops scheduling once one item fails. */
async function mapWithConcurrency(
  count: number,
  limit: number,
  worker: (index: number) => Promise<INodeItem[]>
): Promise<INodeItem[][]> {
  const results: INodeItem[][] = new Array(count);
  const lanes = Math.min(Math.max(1, Math.floor(limit)), count);
  let next = 0;
  let aborted = false;

  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (;;) {
        const index = next++;
        if (index >= count || aborted) {
          return;
        }
        try {
          results[index] = await worker(index);
        } catch (error) {
          aborted = true;
          throw error;
        }
      }
    })
  );

  return results;
}

/** Runs a node over its input items and returns the flattened output items. */
export async function executeNode(
  node: INodeType,
  options: ExecuteNodeOptions
): Promise<INodeItem[]> {
  const logger = options.logger ?? silentLogger;
  const items = options.items?.length ? options.items : [{ json: {} }];
  const nodeName = node.description.name;

  assertCredentials(node, options.credentials ?? {});

  const config = toConfig(node, options, items);
  const startedAt = Date.now();

  const produced = await mapWithConcurrency(items.length, options.concurrency ?? 1, async index => {
    try {
      const output = await runItem(config, index);
      return output.map(item => ({ pairedItem: index, ...item }));
    } catch (error) {
      if (!config.continueOnFail) {
        logger.error(
          { node: nodeName, itemIndex: index, ...toErrorJson(error) },
          '[node] execution failed'
        );
        throw error;
      }
      const failure = toErrorJson(error);
      logger.warn(
        { node: nodeName, itemIndex: index, ...failure },
        '[node] item failed, continuing'
      );
      return [{ json: { error: failure }, error: failure, pairedItem: index }];
    }
  });

  const output = produced.flat();

  logger.debug(
    {
      node: nodeName,
      items: items.length,
      output: output.length,
      concurrency: options.concurrency ?? 1,
      durationMs: Date.now() - startedAt,
    },
    '[node] execution finished'
  );

  return output;
}

/**
 * Runs the node's streaming path for a single item. Memory is loaded before the call and the
 * completed reply is appended once the stream ends, so a streamed turn is remembered like any
 * other; an interrupted stream stores nothing.
 */
export async function* streamNode(
  node: INodeType,
  options: ExecuteNodeOptions
): AsyncGenerator<string, void, unknown> {
  if (!node.stream) {
    throw new NodeOperationError(`Node "${node.description.name}" does not support streaming`, {
      node: node.description.name,
    });
  }

  const items = options.items?.length ? options.items : [{ json: {} }];
  assertCredentials(node, options.credentials ?? {});

  const config = toConfig(node, options, items);
  const binding = node.description.memory;
  const parameters = resolveParameters(node.description.properties, config.parameters, {
    item: items[0],
    itemIndex: 0,
    node: node.description.name,
  });

  if (binding && config.memory && config.services.memory) {
    const history = await config.services.memory.load(config.memory.sessionId, config.memory.limit);
    const supplied = parameters[binding.historyParameter];
    if (history.length > 0) {
      parameters[binding.historyParameter] = [
        ...history,
        ...(Array.isArray(supplied) ? supplied : []),
      ];
    }
  }

  const chunks: string[] = [];

  for await (const chunk of node.stream(buildContext(config, parameters, 0))) {
    chunks.push(chunk);
    yield chunk;
  }

  const prompt = binding ? parameters[binding.promptParameter] : undefined;
  const reply = chunks.join('');

  if (binding && config.memory && config.services.memory && typeof prompt === 'string' && reply) {
    await config.services.memory.append(config.memory.sessionId, [
      { role: 'user', content: prompt },
      { role: 'assistant', content: reply },
    ]);
  }
}
