import { silentLogger } from './logger';
import type { ILogger } from './node.types';
import type { IChatMemory, MemoryMessage } from './services.types';

/** Marks the folded turns so a later fold can recognise and replace its own summary. */
export const SUMMARY_PREFIX = '[Earlier conversation summary]';

export interface SummarisingMemoryOptions {
  inner: IChatMemory;
  /** Produces the replacement text for the turns being folded away. */
  summarise(messages: MemoryMessage[]): Promise<string>;
  /** Turns kept verbatim after a fold. */
  keepRecentTurns?: number;
  /** Fold once the thread grows past this many turns. */
  summariseAfterTurns?: number;
  logger?: ILogger;
}

export function isSummary(message: MemoryMessage): boolean {
  return message.content.startsWith(SUMMARY_PREFIX);
}

function transcript(messages: MemoryMessage[]): string {
  return messages.map(message => `${message.role}: ${message.content}`).join('\n');
}

/**
 * Keeps a long thread usable by folding its oldest turns into a running summary instead of
 * dropping them. The summary is stored as an ordinary turn, so the underlying store needs no
 * new capability, and a previous summary is folded into the next one rather than accumulating.
 *
 * Summarising costs a model call, so it happens on write, never on read. If that call fails the
 * thread is left exactly as it was — a degraded memory beats a failed generation.
 */
export function createSummarisingChatMemory(options: SummarisingMemoryOptions): IChatMemory {
  const keepRecentTurns = options.keepRecentTurns ?? 8;
  const summariseAfterTurns = options.summariseAfterTurns ?? 24;
  const logger = options.logger ?? silentLogger;

  return {
    load: (sessionId, limit) => options.inner.load(sessionId, limit),

    async append(sessionId, messages) {
      await options.inner.append(sessionId, messages);

      const thread = await options.inner.load(sessionId, Number.MAX_SAFE_INTEGER);

      if (thread.length <= summariseAfterTurns) {
        return;
      }

      const overflow = thread.slice(0, Math.max(0, thread.length - keepRecentTurns));
      const recent = thread.slice(-keepRecentTurns);

      if (overflow.length === 0) {
        return;
      }

      try {
        const summary = await options.summarise(overflow);

        if (!summary.trim()) {
          logger.warn({ sessionId }, '[memory] summariser returned nothing, keeping the thread');
          return;
        }

        await options.inner.clear(sessionId);
        await options.inner.append(sessionId, [
          { role: 'user', content: `${SUMMARY_PREFIX} ${summary.trim()}` },
          ...recent,
        ]);

        logger.debug(
          { sessionId, folded: overflow.length, kept: recent.length },
          '[memory] folded older turns into a summary'
        );
      } catch (error) {
        logger.warn(
          { sessionId, error: error instanceof Error ? error.message : String(error) },
          '[memory] summarising failed, leaving the thread untouched'
        );
      }
    },

    clear: sessionId => options.inner.clear(sessionId),
  };
}

export { transcript as summaryTranscript };
