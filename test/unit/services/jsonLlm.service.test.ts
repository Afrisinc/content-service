import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({ runClaude: vi.fn(), runChatGpt: vi.fn() }));

vi.mock('@/adapters/nodes/nodeServices', () => ({ nodeServices: {} }));
vi.mock('@/nodes', () => ({ runClaude: mocks.runClaude, runChatGpt: mocks.runChatGpt }));
vi.mock('@/services/aiCredentials.service', () => ({
  resolveClaudeConfig: async () => ({ credentials: { apiKey: 'a' } }),
  resolveChatGptConfig: async () => ({ credentials: { apiKey: 'o' }, model: 'gpt-saved' }),
}));

const { generateJson, parseJsonReply } = await import('@/services/jsonLlm.service');

const schema = z.object({ name: z.string().min(3) });
const reply = (content: unknown) => [{ json: { content } }];
const request = (overrides = {}) => ({
  system: 'system',
  prompt: (complaint?: string) => (complaint ? `again: ${complaint}` : 'first'),
  schema,
  requestId: 'req-1',
  userId: 'user-1',
  claudeModel: 'claude-default',
  chatGptModel: 'gpt-default',
  maxTokens: 500,
  temperature: 0.5,
  maxAttempts: 2,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseJsonReply', () => {
  it('reads fenced JSON and validates it', () => {
    expect(parseJsonReply('```json\n{"name":"Amina"}\n```', schema)).toEqual({
      value: { name: 'Amina' },
    });
  });

  it('repairs raw line breaks inside strings', () => {
    expect(parseJsonReply('{"name":"Ami\nna"}', schema).value).toEqual({ name: 'Ami\nna' });
  });

  it('explains what failed validation', () => {
    expect(parseJsonReply('{"name":"A"}', schema).complaint).toMatch(/^name: /);
  });

  it('says when the reply is not JSON at all', () => {
    expect(parseJsonReply('sorry', schema)).toEqual({
      complaint: 'the response was not valid JSON',
    });
  });
});

describe('generateJson', () => {
  it('asks Claude first, with the system prompt, model and usage context', async () => {
    mocks.runClaude.mockResolvedValue(reply('{"name":"Amina"}'));

    const result = await generateJson(request());

    expect(result).toEqual({ value: { name: 'Amina' }, provider: 'claude', attempts: 1 });
    expect(mocks.runClaude.mock.calls[0][0]).toMatchObject({
      usageContext: { requestId: 'req-1', userId: 'user-1' },
      parameters: {
        model: 'claude-default',
        systemPrompt: 'system',
        prompt: 'first',
        maxTokens: 500,
      },
    });
    expect(mocks.runChatGpt).not.toHaveBeenCalled();
  });

  it('retries with the complaint before giving up on a provider', async () => {
    mocks.runClaude
      .mockResolvedValueOnce(reply('{"name":"A"}'))
      .mockResolvedValueOnce(reply('{"name":"Amina"}'));

    const result = await generateJson(request());

    expect(result.attempts).toBe(2);
    expect(mocks.runClaude.mock.calls[1][0].parameters.prompt).toMatch(/^again: name: /);
  });

  it('falls back to ChatGPT, using its saved model, when Claude fails', async () => {
    mocks.runClaude.mockRejectedValue(new Error('overloaded'));
    mocks.runChatGpt.mockResolvedValue(reply('{"name":"Amina"}'));

    const result = await generateJson(request());

    expect(result.provider).toBe('chatgpt');
    expect(mocks.runChatGpt.mock.calls[0][0].parameters).toMatchObject({
      model: 'gpt-saved',
      options: { temperature: 0.5, maxTokens: 500 },
    });
  });

  it('treats an empty reply as a provider failure', async () => {
    mocks.runClaude.mockResolvedValue(reply(''));
    mocks.runChatGpt.mockResolvedValue(reply('{"name":"Amina"}'));

    expect((await generateJson(request())).provider).toBe('chatgpt');
  });

  it('names every failure when no provider manages it', async () => {
    mocks.runClaude.mockResolvedValue(reply('{"name":"A"}'));
    mocks.runChatGpt.mockRejectedValue(new Error('quota'));

    await expect(generateJson(request())).rejects.toThrow(
      /no AI provider produced a usable answer \(claude: name: .*; chatgpt: quota\)/
    );
  });

  it('stops at the total attempt budget across providers', async () => {
    mocks.runClaude.mockResolvedValue(reply('{"name":"A"}'));
    mocks.runChatGpt.mockResolvedValue(reply('{"name":"A"}'));

    await expect(generateJson(request({ maxTotalAttempts: 3 }))).rejects.toThrow(/chatgpt: name: /);

    expect(mocks.runClaude).toHaveBeenCalledTimes(2);
    expect(mocks.runChatGpt).toHaveBeenCalledTimes(1);
  });

  it('skips a provider once the budget is spent and says so', async () => {
    mocks.runClaude.mockResolvedValue(reply('{"name":"A"}'));

    await expect(generateJson(request({ maxTotalAttempts: 2 }))).rejects.toThrow(
      /chatgpt: skipped, the attempt budget is spent/
    );
    expect(mocks.runChatGpt).not.toHaveBeenCalled();
  });

  it('does not count a provider that failed before answering against the budget', async () => {
    mocks.runClaude.mockRejectedValue(new Error('overloaded'));
    mocks.runChatGpt
      .mockResolvedValueOnce(reply('{"name":"A"}'))
      .mockResolvedValueOnce(reply('{"name":"Amina"}'));

    const result = await generateJson(request({ maxTotalAttempts: 2 }));

    expect(result).toMatchObject({ provider: 'chatgpt', attempts: 2 });
  });

  it('turns Claude thinking off and asks ChatGPT for JSON mode', async () => {
    mocks.runClaude.mockResolvedValueOnce(reply('{"name":"A"}')).mockRejectedValue(new Error('x'));
    mocks.runChatGpt.mockResolvedValue(reply('{"name":"Amina"}'));

    await generateJson(request());

    expect(mocks.runClaude.mock.calls[0][0].parameters.options).toEqual({ thinking: 'disabled' });
    expect(mocks.runChatGpt.mock.calls[0][0].parameters.jsonOutput).toBe(true);
  });
});
