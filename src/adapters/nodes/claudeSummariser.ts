import { claudeCredentialsFromEnv, runClaude, summaryTranscript } from '@/nodes';
import type { IUsageRecorder, MemoryMessage } from '@/nodes/core';
import { logger } from '@/utils/logger';

export interface ClaudeSummariserOptions {
  model?: string;
  maxTokens?: number;
  /**
   * Passed in rather than imported: `nodeServices` builds this summariser, so
   * reaching back for its recorder would close an import cycle.
   */
  usage?: IUsageRecorder;
}

const SYSTEM_PROMPT =
  'You compress conversation history. Produce a dense factual summary of the exchange below: ' +
  'decisions made, facts established, preferences stated, and anything the assistant must keep ' +
  'to continue the thread. Keep names, numbers and identifiers verbatim. No preamble, no ' +
  'commentary, no bullet points — one paragraph.';

/**
 * Summarises folded turns with a small model. Cost matters here: this runs on every fold, so
 * the default is the cheapest model rather than the one answering the user.
 */
export function createClaudeSummariser(
  options: ClaudeSummariserOptions = {}
): (messages: MemoryMessage[]) => Promise<string> {
  return async messages => {
    const items = await runClaude({
      credentials: claudeCredentialsFromEnv(),
      logger,
      ...(options.usage ? { services: { usage: options.usage } } : {}),
      usageContext: { requestId: 'chat-memory-summary' },
      parameters: {
        resource: 'text',
        operation: 'message',
        model: options.model ?? 'claude-haiku-4-5',
        maxTokens: options.maxTokens ?? 1024,
        systemPrompt: SYSTEM_PROMPT,
        prompt: summaryTranscript(messages),
      },
    });

    const content = items[0]?.json?.content;
    return typeof content === 'string' ? content : '';
  };
}
