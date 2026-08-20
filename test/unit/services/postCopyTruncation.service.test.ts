/**
 * The copy agent hitting its token ceiling. Isolated in its own file because it
 * mocks the node layer, which the rest of the copy tests exercise for real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runClaude = vi.fn();

vi.mock('@/nodes', () => ({
  runClaude,
  ClaudeNode: class {},
  claudeCredentialsFromEnv: () => ({ apiKey: 'test-key' }),
}));

const { CopyUnusableError, PostCopyService } = await import('@/services/postCopy.service');
const { env } = await import('@/config/env');

function reply(json: Record<string, unknown>) {
  return [{ json }];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a response cut off at the token ceiling', () => {
  it('reports being cut off rather than blaming the JSON', async () => {
    const service = new PostCopyService();
    runClaude.mockResolvedValue(
      reply({ content: '{"concept": "cut off mid-', stopReason: 'max_tokens' })
    );

    await expect(service.generate({ topic: 'Board level laptop repair' })).rejects.toThrow(
      /ran past its .*-token limit and was cut off/
    );
  });

  it('names the limit and the way out', async () => {
    const service = new PostCopyService();
    runClaude.mockResolvedValue(reply({ content: '{"a":', stopReason: 'max_tokens' }));

    await expect(service.generate({ topic: 'Board level laptop repair' })).rejects.toThrow(
      /POST_AGENT_MAX_TOKENS/
    );
  });

  it('treats it as a retryable attempt, not a dead run', async () => {
    const service = new PostCopyService();
    runClaude.mockResolvedValue(reply({ content: '{"a":', stopReason: 'max_tokens' }));

    await expect(service.generate({ topic: 'Board level laptop repair' })).rejects.toThrow();

    expect(runClaude).toHaveBeenCalledTimes(env.POST_AGENT_MAX_ATTEMPTS);
  });

  it('leaves a complete response alone', async () => {
    const service = new PostCopyService();
    runClaude.mockResolvedValue(reply({ content: 'not json at all', stopReason: 'end_turn' }));

    await expect(service.generate({ topic: 'Board level laptop repair' })).rejects.toThrow(
      /did not return JSON/
    );
  });

  it('is the kind of failure the run can retry', () => {
    expect(new CopyUnusableError('x')).toBeInstanceOf(Error);
  });
});

describe('token budget', () => {
  it('gives the copy agent room for the schema it is asked for', () => {
    // 2048 could not hold a concept, a caption, fifteen hashtags, the claims and
    // five slides — which is what made the cut-off happen every time.
    expect(env.POST_AGENT_MAX_TOKENS).toBeGreaterThanOrEqual(4096);
  });
});
