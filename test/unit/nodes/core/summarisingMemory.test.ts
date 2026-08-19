import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryChatMemory } from '@/nodes/core/services.inmemory';
import {
  createSummarisingChatMemory,
  isSummary,
  SUMMARY_PREFIX,
} from '@/nodes/core/services.summarising';
import type { IChatMemory, MemoryMessage } from '@/nodes/core';

const turn = (index: number): MemoryMessage[] => [
  { role: 'user', content: `question ${index}` },
  { role: 'assistant', content: `answer ${index}` },
];

let inner: IChatMemory;
let summarise: ReturnType<typeof vi.fn>;
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  inner = createInMemoryChatMemory({ maxTurns: 1000 });
  summarise = vi.fn(async () => 'they discussed the savings product');
});

const memory = () =>
  createSummarisingChatMemory({
    inner,
    summarise,
    keepRecentTurns: 4,
    summariseAfterTurns: 8,
    logger,
  });

async function fill(target: IChatMemory, turns: number) {
  for (let index = 0; index < turns; index += 1) {
    await target.append('session-1', turn(index));
  }
}

describe('createSummarisingChatMemory', () => {
  it('leaves a short thread completely alone', async () => {
    await fill(memory(), 3);

    expect(summarise).not.toHaveBeenCalled();
    expect(await inner.load('session-1', 100)).toHaveLength(6);
  });

  it('folds the oldest turns once the thread grows past the threshold', async () => {
    await fill(memory(), 5);

    expect(summarise).toHaveBeenCalledTimes(1);

    const thread = await inner.load('session-1', 100);
    expect(thread).toHaveLength(5);
    expect(isSummary(thread[0])).toBe(true);
    expect(thread[0].content).toBe(`${SUMMARY_PREFIX} they discussed the savings product`);
    expect(thread.slice(1)).toEqual([
      { role: 'user', content: 'question 3' },
      { role: 'assistant', content: 'answer 3' },
      { role: 'user', content: 'question 4' },
      { role: 'assistant', content: 'answer 4' },
    ]);
  });

  it('hands the summariser the turns being folded, oldest first', async () => {
    await fill(memory(), 5);

    const folded = summarise.mock.calls[0][0] as MemoryMessage[];
    expect(folded[0]).toEqual({ role: 'user', content: 'question 0' });
    expect(folded).toHaveLength(6);
  });

  it('folds a previous summary into the next one instead of stacking them', async () => {
    const subject = memory();
    await fill(subject, 5);
    summarise.mockResolvedValue('an updated running summary');
    await fill(subject, 4);

    const thread = await inner.load('session-1', 100);
    expect(thread.filter(isSummary)).toHaveLength(1);
    expect(thread[0].content).toContain('an updated running summary');

    const secondFold = summarise.mock.calls[1][0] as MemoryMessage[];
    expect(secondFold.some(isSummary)).toBe(true);
  });

  it('keeps the thread untouched when the summariser fails', async () => {
    summarise.mockRejectedValue(new Error('model unavailable'));

    await fill(memory(), 5);

    expect(await inner.load('session-1', 100)).toHaveLength(10);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps the thread untouched when the summariser returns nothing usable', async () => {
    summarise.mockResolvedValue('   ');

    await fill(memory(), 5);

    expect(await inner.load('session-1', 100)).toHaveLength(10);
  });

  it('passes load and clear straight through', async () => {
    const subject = memory();
    await subject.append('session-2', turn(1));

    expect(await subject.load('session-2', 1)).toHaveLength(1);

    await subject.clear('session-2');
    expect(await subject.load('session-2', 10)).toEqual([]);
  });
});
