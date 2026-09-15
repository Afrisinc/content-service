import { z } from 'zod';
import { env } from '@/config/env';
import { nodeServices } from '@/adapters/nodes/nodeServices';
import {
  chatGptCredentialsFromEnv,
  claudeCredentialsFromEnv,
  runChatGpt,
  runClaude,
} from '@/nodes';
import { OllamaLlmProvider } from '@/studio/providers/llm/ollama.provider';
import { extractJson } from '@/studio/directors/structured';
import { ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';

export const episodeContentSchema = z.object({
  title: z.string().min(3).max(120),
  hook: z.string().min(10).max(240),
  body: z.string().min(200).max(20000),
  cliffhanger: z.string().max(300).optional(),
  themes: z.array(z.string().max(60)).max(6).default([]),
  content_warnings: z.array(z.string().max(60)).max(6).default([]),
  promotion_caption: z.string().min(20).max(280),
  promotion_hashtags: z
    .array(z.string().regex(/^#\w+$/))
    .max(10)
    .default([]),
});

export type EpisodeContent = z.infer<typeof episodeContentSchema>;

export interface EpisodeBrief {
  storyTitle: string;
  premise: string;
  genre?: string;
  language: string;
  audience?: string;
  tone?: string;
  episodeNumber: number;
  priorCliffhanger?: string;
  priorSummary?: string;
  instructions?: string;
}

export interface EpisodeGenerationResult {
  content: EpisodeContent;
  provider: 'chatgpt' | 'claude' | 'ollama';
  attempts: number;
}

const SYSTEM_PROMPT = [
  'You are a professional episodic fiction writer for a media brand website.',
  'Write clean, engaging, production-ready prose — vivid, well-paced, free of clichés and',
  'placeholder text. Every episode must stand on its own while advancing the larger story.',
  'Return one JSON object and nothing else: no prose before or after it, no markdown fences.',
].join(' ');

function userPrompt(brief: EpisodeBrief, complaint?: string): string {
  const lines = [
    `Story: ${brief.storyTitle}`,
    `Premise: ${brief.premise}`,
    brief.genre ? `Genre: ${brief.genre}` : '',
    `Language: ${brief.language}`,
    brief.audience ? `Audience: ${brief.audience}` : '',
    brief.tone ? `Tone: ${brief.tone}` : '',
    `This is episode ${brief.episodeNumber}.`,
    brief.priorSummary ? `What happened before: ${brief.priorSummary}` : '',
    brief.priorCliffhanger
      ? `Pick up from this cliffhanger: ${brief.priorCliffhanger}`
      : 'This opens the series — hook the reader in the first paragraph.',
    brief.instructions ? `Additional direction: ${brief.instructions}` : '',
    '',
    'Return JSON in exactly this shape:',
    '{',
    '  "title": "episode title",',
    '  "hook": "one or two sentences that sell the episode",',
    '  "body": "the full episode, several paragraphs, plain text with \\n\\n between paragraphs",',
    '  "cliffhanger": "optional — what makes readers want the next episode",',
    '  "themes": ["short theme tags"],',
    '  "content_warnings": ["only if genuinely warranted"],',
    '  "promotion_caption": "a short, attention-grabbing social caption advertising this episode",',
    '  "promotion_hashtags": ["#like", "#this"]',
    '}',
  ];
  if (complaint) {
    lines.push('', `Your previous attempt was rejected: ${complaint}`, 'Fix it and return JSON.');
  }
  return lines.filter(Boolean).join('\n');
}

function parseCandidate(raw: string): { content?: EpisodeContent; complaint?: string } {
  let candidate: unknown;
  try {
    candidate = JSON.parse(extractJson(raw));
  } catch {
    return { complaint: 'the response was not valid JSON' };
  }

  const parsed = episodeContentSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      complaint: parsed.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    };
  }
  return { content: parsed.data };
}

async function generateWithChatGpt(
  prompt: string,
  requestId: string,
  userId: string
): Promise<string> {
  const items = await runChatGpt({
    credentials: chatGptCredentialsFromEnv(),
    logger,
    services: nodeServices,
    usageContext: { requestId, userId },
    parameters: {
      resource: 'text',
      operation: 'message',
      model: env.STORY_LLM_CHATGPT_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      prompt,
      options: { temperature: env.STORY_LLM_TEMPERATURE, maxTokens: env.STORY_LLM_MAX_TOKENS },
    },
  });

  const content = items[0]?.json?.content;
  if (!content || typeof content !== 'string') {
    throw new ServerError('chatgpt returned no content');
  }
  return content;
}

async function generateWithClaude(
  prompt: string,
  requestId: string,
  userId: string
): Promise<string> {
  const items = await runClaude({
    credentials: claudeCredentialsFromEnv(),
    logger,
    services: nodeServices,
    usageContext: { requestId, userId },
    parameters: {
      resource: 'text',
      operation: 'message',
      model: env.STORY_LLM_CLAUDE_MODEL,
      maxTokens: env.STORY_LLM_MAX_TOKENS,
      systemPrompt: SYSTEM_PROMPT,
      prompt,
    },
  });

  const content = items[0]?.json?.content;
  if (!content || typeof content !== 'string') {
    throw new ServerError('claude returned no content');
  }
  return content;
}

const ollamaProvider = new OllamaLlmProvider();

async function generateWithOllama(prompt: string): Promise<string> {
  const response = await ollamaProvider.complete({
    system: SYSTEM_PROMPT,
    prompt,
    temperature: env.STORY_LLM_TEMPERATURE,
    maxTokens: env.STORY_LLM_MAX_TOKENS,
    jsonOnly: true,
  });
  return response.text;
}

/**
 * chatgpt is the primary writer; claude is the cloud fallback if it errors or refuses;
 * ollama is the final, always-available fallback so generation degrades instead of failing.
 */
async function attemptProvider(
  provider: 'chatgpt' | 'claude' | 'ollama',
  brief: EpisodeBrief,
  requestId: string,
  userId: string
): Promise<EpisodeGenerationResult> {
  let complaint: string | undefined;

  for (let attempt = 1; attempt <= env.STORY_LLM_MAX_ATTEMPTS; attempt += 1) {
    const prompt = userPrompt(brief, complaint);
    const raw =
      provider === 'chatgpt'
        ? await generateWithChatGpt(prompt, requestId, userId)
        : provider === 'claude'
          ? await generateWithClaude(prompt, requestId, userId)
          : await generateWithOllama(prompt);

    const { content, complaint: issue } = parseCandidate(raw);
    if (content) {
      return { content, provider, attempts: attempt };
    }

    complaint = issue;
    logger.warn({ provider, attempt, complaint }, 'story agent: unusable episode, retrying');
  }

  throw new ServerError(`${provider} could not produce a usable episode: ${complaint}`);
}

export class StoryLlmService {
  async generateEpisode(
    brief: EpisodeBrief,
    requestId: string,
    userId: string
  ): Promise<EpisodeGenerationResult> {
    const chain: Array<'chatgpt' | 'claude' | 'ollama'> = ['chatgpt', 'claude', 'ollama'];
    const failures: string[] = [];

    for (const provider of chain) {
      try {
        return await attemptProvider(provider, brief, requestId, userId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider}: ${message}`);
        logger.warn({ provider, error: message }, 'story agent: provider failed, trying fallback');
      }
    }

    throw new ServerError(`every story provider failed — ${failures.join(' | ')}`);
  }
}

export const storyLlmService = new StoryLlmService();
