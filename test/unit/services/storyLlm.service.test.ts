import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SYSTEM_PROMPT,
  storyLlmService,
  userPrompt,
  type EpisodeBrief,
} from '@/services/storyLlm.service';

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
vi.mock('@/services/aiCredentials.service', () => ({
  resolveChatGptConfig: async () => ({ credentials: { apiKey: 'sk-test' } }),
  resolveClaudeConfig: async () => ({ credentials: { apiKey: 'anthropic-test' } }),
}));
vi.mock('@/studio/providers/llm/ollama.provider', () => ({
  OllamaLlmProvider: vi.fn().mockImplementation(() => ({ complete: mocks.ollamaComplete })),
}));

const SENTENCE =
  'The operator listened to the static and wrote down every number the voice read aloud.';

function paragraph(sentences = 9): string {
  return Array.from({ length: sentences }, () => SENTENCE).join(' ');
}

function validBody(paragraphs = 4): string {
  return Array.from({ length: paragraphs }, () => paragraph()).join('\n\n');
}

function validEpisodeJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: 'The Signal in the Static',
    hook: 'A dead channel starts broadcasting a voice no one sent.',
    body: validBody(),
    cliffhanger: 'The voice says her name.',
    summary:
      'Amina, the night operator at a dark station, hears a voice reading numbers and realises ' +
      'it knows her name.',
    continuity_notes: ['Amina works nights at Radio Kigali', 'The voice reads numbers'],
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
  priorEpisodes: [],
  continuityNotes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  envMock.STORY_LLM_MAX_ATTEMPTS = 2;
});

describe('what an episode must be to be accepted', () => {
  const rejectedFor = async (overrides: Record<string, unknown>) => {
    mocks.runClaude
      .mockResolvedValueOnce([{ json: { content: validEpisodeJson(overrides) } }])
      .mockResolvedValueOnce([{ json: { content: validEpisodeJson() } }]);

    await storyLlmService.generateEpisode(brief, 'req-gate', 'user-1');

    return mocks.runClaude.mock.calls[1][0].parameters.prompt as string;
  };

  it('keeps the continuity notes and the summary the writer gave', async () => {
    mocks.runClaude.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const { content } = await storyLlmService.generateEpisode(brief, 'req-memory', 'user-1');

    expect(content.summary).toContain('Amina');
    expect(content.continuity_notes).toEqual([
      'Amina works nights at Radio Kigali',
      'The voice reads numbers',
    ]);
  });

  it('sends back an episode that is too short, saying how short', async () => {
    const prompt = await rejectedFor({ body: validBody(1).split(' ').slice(0, 120).join(' ') });

    expect(prompt).toMatch(/body: the episode is only \d+ words — it needs at least 450/);
  });

  it('sends back an episode that is one block of text', async () => {
    const prompt = await rejectedFor({ body: paragraph(45) });

    expect(prompt).toContain('it has 1 paragraphs — separate at least 4 with blank lines');
  });

  it.each([
    ['a placeholder name', `${validBody()}\n\n[Character name] smiled.`],
    ['lorem ipsum', `${validBody()}\n\nLorem ipsum dolor sit amet.`],
    ['a TODO', `${validBody()}\n\nTODO finish this scene.`],
  ])('sends back an episode with %s in it', async (_label, body) => {
    const prompt = await rejectedFor({ body });

    expect(prompt).toContain('it contains placeholder text');
  });

  it.each([
    ['an episode label', `Episode 4\n\n${validBody()}`],
    ['a chapter label', `Chapter 2\n\n${validBody()}`],
    ['a markdown heading', `# The Signal\n\n${validBody()}`],
  ])('sends back an episode that begins with %s', async (_label, body) => {
    const prompt = await rejectedFor({ body });

    expect(prompt).toContain('write prose only');
  });

  it('sends back an episode with no cliffhanger', async () => {
    const prompt = await rejectedFor({ cliffhanger: undefined });

    expect(prompt).toContain('cliffhanger: Required');
  });

  it('sends back an episode with no summary', async () => {
    const prompt = await rejectedFor({ summary: undefined });

    expect(prompt).toContain('summary: Required');
  });

  it('accepts an episode with no continuity notes', async () => {
    mocks.runClaude.mockResolvedValue([
      { json: { content: validEpisodeJson({ continuity_notes: undefined }) } },
    ]);

    const { content } = await storyLlmService.generateEpisode(brief, 'req-no-notes', 'user-1');

    expect(content.continuity_notes).toEqual([]);
  });
});

describe('the prompts', () => {
  it('give the writer craft rules and a ban on meta text', () => {
    expect(SYSTEM_PROMPT).toContain('Craft rules:');
    expect(SYSTEM_PROMPT).toContain('Open inside a scene');
    expect(SYSTEM_PROMPT).toContain('Keep every fact consistent with the story so far');
    expect(SYSTEM_PROMPT).toContain('no mention of AI');
  });

  it('opens a series with a hook instruction and the length to aim for', () => {
    const prompt = userPrompt(brief);

    expect(prompt).toContain('This is episode 1. Write between 900 and 1,300 words.');
    expect(prompt).toContain('This opens the series');
    expect(prompt).not.toContain('Story so far:');
  });

  it('gives the writer the whole story so far, the facts to keep and how it last ended', () => {
    const prompt = userPrompt({
      ...brief,
      episodeNumber: 3,
      priorEpisodes: [
        { episodeNumber: 1, title: 'The Signal', summary: 'Amina hears the voice.' },
        { episodeNumber: 2, title: 'The Numbers', summary: 'She decodes the first number.' },
      ],
      continuityNotes: ['Amina works nights', 'The voice reads numbers'],
      previousEnding: 'The door opened.',
      priorCliffhanger: 'Someone was inside.',
    });

    expect(prompt).toContain('Story so far:');
    expect(prompt).toContain('Episode 1 — The Signal: Amina hears the voice.');
    expect(prompt).toContain('Episode 2 — The Numbers: She decodes the first number.');
    expect(prompt).toContain(
      'Facts to keep consistent:\n- Amina works nights\n- The voice reads numbers'
    );
    expect(prompt).toContain('The previous episode closed with: "The door opened."');
    expect(prompt).toContain('Pick up from this cliffhanger: Someone was inside.');
    expect(prompt).not.toContain('This opens the series');
  });

  it('asks for the summary and continuity notes that the next episode will rely on', () => {
    const prompt = userPrompt(brief);

    expect(prompt).toContain('"summary":');
    expect(prompt).toContain('"continuity_notes":');
    expect(prompt).toContain('"cliffhanger": "the turn the episode ends on');
  });

  it('repeats the complaint when an attempt is sent back', () => {
    const prompt = userPrompt(brief, 'body: too short');

    expect(prompt).toContain('Your previous attempt was rejected: body: too short');
  });
});

describe('storyLlmService.generateEpisode', () => {
  it('uses claude as the primary writer', async () => {
    mocks.runClaude.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-1', 'user-1');

    expect(result.provider).toBe('claude');
    expect(result.attempts).toBe(1);
    expect(result.content.title).toBe('The Signal in the Static');
    expect(mocks.runChatGpt).not.toHaveBeenCalled();
    expect(mocks.ollamaComplete).not.toHaveBeenCalled();
  });

  it('falls back to chatgpt when claude fails', async () => {
    mocks.runClaude.mockRejectedValue(new Error('rate limited'));
    mocks.runChatGpt.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-2', 'user-1');

    expect(result.provider).toBe('chatgpt');
    expect(mocks.ollamaComplete).not.toHaveBeenCalled();
  });

  it('falls back to ollama when claude and chatgpt both fail', async () => {
    mocks.runClaude.mockRejectedValue(new Error('down'));
    mocks.runChatGpt.mockRejectedValue(new Error('down'));
    mocks.ollamaComplete.mockResolvedValue({ text: validEpisodeJson() });

    const result = await storyLlmService.generateEpisode(brief, 'req-3', 'user-1');

    expect(result.provider).toBe('ollama');
  });

  it('retries a provider once with the parsing complaint before giving up on it', async () => {
    mocks.runClaude
      .mockResolvedValueOnce([{ json: { content: '{"nonsense": true}' } }])
      .mockResolvedValueOnce([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-4', 'user-1');

    expect(result.provider).toBe('claude');
    expect(result.attempts).toBe(2);
    expect(mocks.runClaude).toHaveBeenCalledTimes(2);
    const secondPrompt = mocks.runClaude.mock.calls[1][0].parameters.prompt;
    expect(secondPrompt).toContain('Your previous attempt was rejected');
  });

  it('falls back to chatgpt when claude comes back with empty content', async () => {
    mocks.runClaude.mockResolvedValue([{ json: { content: '' } }]);
    mocks.runChatGpt.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-empty-claude', 'user-1');

    expect(result.provider).toBe('chatgpt');
  });

  it('treats a reply with no JSON at all as an unusable attempt and retries', async () => {
    mocks.runClaude
      .mockResolvedValueOnce([{ json: { content: 'sorry, I cannot help with that' } }])
      .mockResolvedValueOnce([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-not-json', 'user-1');

    expect(result.attempts).toBe(2);
  });

  it('builds the opening-episode prompt when a cliffhanger to continue from exists', async () => {
    mocks.runClaude.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    await storyLlmService.generateEpisode(
      { ...brief, priorCliffhanger: 'A door creaks open in the dark.' },
      'req-cliffhanger',
      'user-1'
    );

    const prompt = mocks.runClaude.mock.calls[0][0].parameters.prompt;
    expect(prompt).toContain('Pick up from this cliffhanger: A door creaks open in the dark.');
  });

  it('passes the userId through so the per-user budget guard can enforce a cap', async () => {
    mocks.runClaude.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    await storyLlmService.generateEpisode(brief, 'req-budget', 'user-42');

    expect(mocks.runClaude.mock.calls[0][0].usageContext).toEqual({
      requestId: 'req-budget',
      userId: 'user-42',
    });
  });

  it('falls back to ollama when chatgpt comes back with empty content', async () => {
    mocks.runClaude.mockRejectedValue(new Error('down'));
    mocks.runChatGpt.mockResolvedValue([{ json: { content: '' } }]);
    mocks.ollamaComplete.mockResolvedValue({ text: validEpisodeJson() });

    const result = await storyLlmService.generateEpisode(brief, 'req-empty-chatgpt', 'user-1');

    expect(result.provider).toBe('ollama');
  });

  it('moves to the next provider once a provider exhausts every attempt on bad JSON', async () => {
    mocks.runClaude.mockResolvedValue([{ json: { content: '{"nonsense": true}' } }]);
    mocks.runChatGpt.mockResolvedValue([{ json: { content: validEpisodeJson() } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-exhaust', 'user-1');

    expect(result.provider).toBe('chatgpt');
    expect(mocks.runClaude).toHaveBeenCalledTimes(envMock.STORY_LLM_MAX_ATTEMPTS);
  });

  it('accepts an episode whose body carries raw line breaks inside the JSON string', async () => {
    const raw = validEpisodeJson().replace(/\\n/g, '\n');
    expect(() => JSON.parse(raw)).toThrow();
    mocks.runClaude.mockResolvedValue([{ json: { content: raw } }]);

    const result = await storyLlmService.generateEpisode(brief, 'req-raw-newlines', 'user-1');

    expect(result.provider).toBe('claude');
    expect(result.attempts).toBe(1);
    expect(result.content.body.split('\n\n')).toHaveLength(4);
  });

  it('unwraps a markdown-fenced JSON reply', async () => {
    mocks.runClaude.mockResolvedValue([
      { json: { content: `Here you go:\n\`\`\`json\n${validEpisodeJson()}\n\`\`\`` } },
    ]);

    const result = await storyLlmService.generateEpisode(brief, 'req-5', 'user-1');

    expect(result.content.title).toBe('The Signal in the Static');
  });

  it('throws once every provider has failed, naming each failure', async () => {
    mocks.runClaude.mockRejectedValue(new Error('claude down'));
    mocks.runChatGpt.mockRejectedValue(new Error('chatgpt down'));
    mocks.ollamaComplete.mockRejectedValue(new Error('ollama down'));

    await expect(storyLlmService.generateEpisode(brief, 'req-6', 'user-1')).rejects.toThrow(
      /claude.*chatgpt.*ollama/s
    );
  });
});
