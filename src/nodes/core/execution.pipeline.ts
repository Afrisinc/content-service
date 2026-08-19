import { buildCacheKey } from './cache.key';
import { NodeOperationError } from './node.errors';
import { resolveParameters, type RawParameters } from './parameters';
import { costMicroUsd, findPricing, usageFrom } from './pricing';
import type {
  ILogger,
  INodeExecutionContext,
  INodeItem,
  INodeType,
  JsonObject,
  ResolvedParameters,
} from './node.types';
import {
  EMPTY_USAGE,
  type MemoryMessage,
  type NodeServices,
  type UsageEvent,
} from './services.types';

export interface PipelineConfig {
  node: INodeType;
  items: INodeItem[];
  parameters: RawParameters;
  credentials: Record<string, JsonObject>;
  services: NodeServices;
  memory?: { sessionId: string; limit?: number };
  cache?: { ttlSeconds: number };
  idempotency?: { key: string; ttlSeconds?: number };
  usageContext?: { userId?: string; requestId?: string };
  continueOnFail: boolean;
  logger: ILogger;
  signal?: AbortSignal;
}

const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 86400;

export function buildContext(
  config: PipelineConfig,
  parameters: ResolvedParameters,
  itemIndex: number
): INodeExecutionContext {
  return {
    getInputData: () => config.items,
    getItem: () => config.items[itemIndex],
    getItemIndex: () => itemIndex,
    getNodeParameter: <T>(name: string, fallback?: T) =>
      (parameters[name] === undefined ? fallback : parameters[name]) as T,
    getAllParameters: () => ({ ...parameters }),
    getCredentials: <T>(name: string) => {
      const credential = config.credentials[name];
      if (!credential) {
        throw new NodeOperationError(`Credentials "${name}" are not available`, {
          node: config.node.description.name,
          itemIndex,
        });
      }
      return credential as T;
    },
    continueOnFail: () => config.continueOnFail,
    logger: config.logger,
    signal: config.signal,
  };
}

async function loadMemory(
  config: PipelineConfig,
  parameters: ResolvedParameters
): Promise<MemoryMessage[]> {
  const binding = config.node.description.memory;

  if (!binding || !config.memory || !config.services.memory) {
    return [];
  }

  const history = await config.services.memory.load(config.memory.sessionId, config.memory.limit);

  if (history.length > 0) {
    const supplied = parameters[binding.historyParameter];
    parameters[binding.historyParameter] = [
      ...history,
      ...(Array.isArray(supplied) ? supplied : []),
    ];
  }

  return history;
}

async function appendMemory(
  config: PipelineConfig,
  parameters: ResolvedParameters,
  produced: INodeItem[]
): Promise<void> {
  const binding = config.node.description.memory;

  if (!binding || !config.memory || !config.services.memory) {
    return;
  }

  const prompt = parameters[binding.promptParameter];
  const reply = produced[0]?.json?.[binding.replyField];

  // A declined or empty answer is not a turn: storing half of an exchange would replay
  // the question on the next call and quietly corrupt the thread.
  if (typeof prompt !== 'string' || typeof reply !== 'string' || prompt === '' || reply === '') {
    return;
  }

  await config.services.memory.append(config.memory.sessionId, [
    { role: 'user', content: prompt },
    { role: 'assistant', content: reply },
  ]);
}

function cacheKeyFor(
  config: PipelineConfig,
  parameters: ResolvedParameters
): { key: string; ttlSeconds: number } | undefined {
  if (config.idempotency) {
    return {
      key: `ainode:idem:${config.idempotency.key}`,
      ttlSeconds: config.idempotency.ttlSeconds ?? DEFAULT_IDEMPOTENCY_TTL_SECONDS,
    };
  }

  if (!config.cache || !config.services.cache) {
    return undefined;
  }

  return {
    key: buildCacheKey({
      node: config.node.description.name,
      version: config.node.description.version,
      parameters,
      credentials: config.credentials,
    }),
    ttlSeconds: config.cache.ttlSeconds,
  };
}

interface Outcome {
  cached: boolean;
  success: boolean;
  latencyMs: number;
  errorCode?: string;
}

function usageEvent(
  config: PipelineConfig,
  parameters: ResolvedParameters,
  produced: INodeItem[],
  outcome: Outcome
): UsageEvent {
  const json = produced[0]?.json ?? {};
  // A cache hit consumed nothing; recording its tokens would overstate spend.
  const usage = outcome.cached ? EMPTY_USAGE : usageFrom(json.usage);
  const model = (json.model as string) ?? (parameters.model as string) ?? 'unknown';

  return {
    node: config.node.description.name,
    model,
    resource: String(parameters.resource ?? ''),
    operation: String(parameters.operation ?? ''),
    userId: config.usageContext?.userId ?? null,
    sessionId: config.memory?.sessionId ?? null,
    requestId: config.usageContext?.requestId ?? null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costMicroUsd: outcome.cached
      ? 0n
      : costMicroUsd(usage, findPricing(model, config.node.pricing ?? {})),
    latencyMs: outcome.latencyMs,
    success: outcome.success,
    cached: outcome.cached,
    errorCode: outcome.errorCode ?? null,
  };
}

async function settle(
  config: PipelineConfig,
  parameters: ResolvedParameters,
  produced: INodeItem[],
  outcome: Outcome
): Promise<void> {
  const event = usageEvent(config, parameters, produced, outcome);

  config.services.usage?.record(event);

  const userId = config.usageContext?.userId;
  if (userId && config.services.budget && event.costMicroUsd > 0n) {
    await config.services.budget.consume(userId, event.costMicroUsd);
  }
}

async function assertBudget(config: PipelineConfig, itemIndex: number): Promise<void> {
  const userId = config.usageContext?.userId;

  if (!userId || !config.services.budget) {
    return;
  }

  const decision = await config.services.budget.check(userId);

  if (!decision.allowed) {
    throw new NodeOperationError('AI spend limit reached for this user', {
      node: config.node.description.name,
      itemIndex,
      description: `spent ${decision.spentMicroUsd} of ${decision.limitMicroUsd} micro-USD`,
    });
  }
}

/** Resolve, remember, cache, guard, run, account — in that order, for one item. */
export async function runItem(config: PipelineConfig, itemIndex: number): Promise<INodeItem[]> {
  const startedAt = Date.now();
  const parameters = resolveParameters(config.node.description.properties, config.parameters, {
    item: config.items[itemIndex],
    itemIndex,
    node: config.node.description.name,
  });

  await loadMemory(config, parameters);

  const cacheEntry = cacheKeyFor(config, parameters);

  if (cacheEntry && config.services.cache) {
    const hit = await config.services.cache.get<INodeItem[]>(cacheEntry.key);

    if (hit) {
      config.logger.debug(
        { node: config.node.description.name, itemIndex },
        '[node] served from cache'
      );
      await settle(config, parameters, hit, {
        cached: true,
        success: true,
        latencyMs: Date.now() - startedAt,
      });
      return hit;
    }
  }

  await assertBudget(config, itemIndex);

  try {
    const produced = await config.node.execute(buildContext(config, parameters, itemIndex));

    await appendMemory(config, parameters, produced);

    if (cacheEntry && config.services.cache) {
      await config.services.cache.set(cacheEntry.key, produced, cacheEntry.ttlSeconds);
    }

    await settle(config, parameters, produced, {
      cached: false,
      success: true,
      latencyMs: Date.now() - startedAt,
    });

    return produced;
  } catch (error) {
    await settle(config, parameters, [], {
      cached: false,
      success: false,
      latencyMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}
