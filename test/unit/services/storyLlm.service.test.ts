import { describe, expect, it, vi, beforeEach } from 'vitest';
import { storyLlmService, type EpisodeBrief } from '@/services/storyLlm.service';

const mocks = vi.hoisted(() => ({
  runChatGpt: vi.fn(),
  runClaude: vi.fn(),
  ollamaComplete: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  STORY_LLM_CHATGPT_MODEL: 'gpt-4o',
  STORY_LLM_CLAUDE_MODEL: 'claude-sonnet-5',
  STORY_LLM_MAX_TOKENS: 4096,
  STORY_LLM_TEMPERATURE: 0.85,
  STORY_LLM_MAX_ATTEMPTS: 2,
}));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/adapters/nodes/nodeServices', () => ({ nodeServices: {} }));
vi.mock('@/nodes', () => ({
  runChatGpt: mocks.runChatGpt,
  runClaude: mocks.runClaude,
  chatGptCredentialsFromEnv: () => ({ apiKey: 'sk-test' }),
  claudeCredentialsFromEnv: () => ({ apiKey: 'anthropic-test' }),
}));
vi.mock('@/studio/providers/llm/ollama.provider', () => ({
  OllamaLlmProvider: vi.fn().mockImplementation(() => ({ complete: mocks.ollamaComplete })),
}));

function validEpisodeJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: 'The Signal in the Static',
    hook: 'A dead channel starts broadcasting a voice no one sent.',
    body:
      'Paragraph one of the episode unfolds slowly, setting the scene in a quiet radio ' +
      'station long after the last broadcast should have ended.\n\nParagraph two continues ' +
      'the story further, as the operator realizes the voice on the line knows things only ' +
      'she should know, and the static behind it never quite goes silent.',
    cliffhanger: 'The voice says her name.',
    themes: ['mystery'],
    content_warnings: [],
    promotion_caption: 'A signal that should not exist just said her name. Read episode one now.',
    promotion_hashtags: ['#fiction', '#story'],
    ...overrides,
  });
}

const brief: EpisodeBrief = {
  storyTitle: 'Static',
  premise: 'A radio operator hears a voice from a station that went dark decades ago.',
  language: 'en',
  episodeNumber: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  envMock.STORY_LLM_MAX_ATTEMPTS = 2;
});

describe('storyLlmService.generateEpisode', () => {
  it('uses chatgpt as the primary writer', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-1', 'user-1');

    expect(result.provider).toBe('chatgpt');
    expect(result.attempts).toBe(1);
    expect(result.content.title).toBe('The Signal in the Static');
    expect(mocks.runClaude).not.toHaveBeenCalled();
    expect(mocks.ollamaComplete).not.toHaveBeenCalled();
  });

  it('falls back to claude when chatgpt fails', async () => {
    mocks.runChatGpt.mockRejectedValue(new Error('rate limited'));
    mocks.runClaude.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-2', 'user-1');

    expect(result.provider).toBe('claude');
    expect(mocks.ollamaComplete).not.toHaveBeenCalled();
  });

  it('falls back to ollama when chatgpt and claude both fail', async () => {
    mocks.runChatGpt.mockRejectedValue(new Error('down'));
    mocks.runClaude.mockRejectedValue(new Error('down'));
    mocks.ollamaComplete.mockResolvedValue({ text: validEpisodeJson() });

    const result = await storyLlmService.generateEpisode(brief, 'req-3', 'user-1');

    expect(result.provider).toBe('ollama');
  });

  it('retries a provider once with the parsing complaint before giving up on it', async () => {
    mocks.runChatGpt
      .mockResolvedValueOnce([{ json: { content: '{"nonsense": true}' } }])
      .mockResolvedValueOnce([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-4', 'user-1');

    expect(result.provider).toBe('chatgpt');
    expect(result.attempts).toBe(2);
    expect(mocks.runChatGpt).toHaveBeenCalledTimes(2);
    const secondPrompt = mocks.runChatGpt.mock.calls[1][0].parameters.prompt;
    expect(secondPrompt).toContain('Your previous attempt was rejected');
  });

  it('falls back to claude when chatgpt comes back with empty content', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { content: '' } }]);
    mocks.runClaude.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-empty-chatgpt', 'user-1');

    expect(result.provider).toBe('claude');
  });

  it('treats a reply with no JSON at all as an unusable attempt and retries', async () => {
    mocks.runChatGpt
      .mockResolvedValueOnce([{ json: { content: 'sorry, I cannot help with that' } }])
      .mockResolvedValueOnce([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-not-json', 'user-1');

    expect(result.attempts).toBe(2);
  });

  it('builds the opening-episode prompt when a cliffhanger to continue from exists', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    await storyLlmService.generateEpisode(
      { ...brief, priorCliffhanger: 'A door creaks open in the dark.' },
      'req-cliffhanger',
      'user-1'
    );

    const prompt = mocks.runChatGpt.mock.calls[0][0].parameters.prompt;
    expect(prompt).toContain('Pick up from this cliffhanger: A door creaks open in the dark.');
  });

  it('passes the userId through so the per-user budget guard can enforce a cap', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    await storyLlmService.generateEpisode(brief, 'req-budget', 'user-42');

    expect(mocks.runChatGpt.mock.calls[0][0].usageContext).toEqual({
      requestId: 'req-budget',
      userId: 'user-42',
    });
  });

  it('falls back to ollama when claude comes back with empty content', async () => {
    mocks.runChatGpt.mockRejectedValue(new Error('down'));
    mocks.runClaude.mockResolvedValue([{ json: { content: '' } }]);
    mocks.ollamaComplete.mockResolvedValue({ text: validEpisodeJson() });

    const result = await storyLlmService.generateEpisode(brief, 'req-empty-claude', 'user-1');

    expect(result.provider).toBe('ollama');
  });

  it('moves to the next provider once a provider exhausts every attempt on bad JSON', async () => {
    mocks.runChatGpt.mockResolvedValue([{ json: { content: '{"nonsense": true}' } }]);
    mocks.runClaude.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-exhaust', 'user-1');

    expect(result.provider).toBe('claude');
    expect(mocks.runChatGpt).toHaveBeenCalledTimes(envMock.STORY_LLM_MAX_ATTEMPTS);
  });

  it('unwraps a markdown-fenced JSON reply', async () => {
    mocks.runChatGpt.mockResolvedValue([
      { json: { content: `Here you go:\n\`\`\`json\n${validEpisodeJson()}\n\`\`\`` } },
    ]);

    const result = await storyLlmService.generateEpisode(brief, 'req-5', 'user-1');

    expect(result.content.title).toBe('The Signal in the Static');
  });

  it('throws once every provider has failed, naming each failure', async () => {
    mocks.runChatGpt.mockRejectedValue(new Error('chatgpt down'));
    mocks.runClaude.mockRejectedValue(new Error('claude down'));
    mocks.ollamaComplete.mockRejectedValue(new Error('ollama down'));

    await expect(storyLlmService.generateEpisode(brief, 'req-6', 'user-1')).rejects.toThrow(
      /chatgpt.*claude.*ollama/s
    );
  });
});
