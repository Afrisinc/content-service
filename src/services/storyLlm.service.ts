import { z } from 'zod';
import { env } from '@/config/env';
import { nodeServices } from '@/adapters/nodes/nodeServices';
import { runChatGpt, runClaude } from '@/nodes';
import { resolveChatGptConfig, resolveClaudeConfig } from '@/services/aiCredentials.service';
import { OllamaLlmProvider } from '@/studio/providers/llm/ollama.provider';
import { parseLenientJson } from '@/helpers/jsonRepair.helper';
import { extractJson } from '@/studio/directors/structured';
import { ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';

export const MIN_EPISODE_WORDS = 450;
export const MIN_EPISODE_PARAGRAPHS = 4;

const PLACEHOLDER = /\[[^\]\n]{1,40}\]|lorem ipsum|\bTODO\b/i;
const LABEL_OR_HEADING = /^\s*(?:episode\s+\d+|chapter\s+\d+|#{1,6}\s)/im;

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const episodeBodySchema = z
  .string()
  .max(20000)
  .superRefine((body, ctx) => {
    const count = words(body);
    if (count < MIN_EPISODE_WORDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `the episode is only ${count} words — it needs at least ${MIN_EPISODE_WORDS}`,
      });
    }

    const paragraphs = body.split(/\n\s*\n/).filter(part => part.trim()).length;
    if (paragraphs < MIN_EPISODE_PARAGRAPHS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          `it has ${paragraphs} paragraphs — separate at least ` +
          `${MIN_EPISODE_PARAGRAPHS} with blank lines`,
      });
    }

    if (PLACEHOLDER.test(body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'it contains placeholder text such as [Name], TODO or lorem ipsum',
      });
    }

    if (LABEL_OR_HEADING.test(body)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'a line starts with an episode or chapter label or a markdown heading — write prose only',
      });
    }
  });

export const episodeContentSchema = z.object({
  title: z.string().min(3).max(120),
  hook: z.string().min(10).max(240),
  body: episodeBodySchema,
  cliffhanger: z.string().min(10).max(300),
  summary: z.string().min(40).max(700),
  continuity_notes: z.array(z.string().min(3).max(160)).max(8).default([]),
  themes: z.array(z.string().max(60)).max(6).default([]),
  content_warnings: z.array(z.string().max(60)).max(6).default([]),
  promotion_caption: z.string().min(20).max(280),
  promotion_hashtags: z
    .array(z.string().regex(/^#\w+$/))
    .max(10)
    .default([]),
});

export type EpisodeContent = z.infer<typeof episodeContentSchema>;

export interface PriorEpisodeSummary {
  episodeNumber: number;
  title: string;
  summary: string;
}

export interface EpisodeBrief {
  storyTitle: string;
  premise: string;
  genre?: string;
  language: string;
  audience?: string;
  tone?: string;
  episodeNumber: number;
  priorEpisodes: PriorEpisodeSummary[];
  continuityNotes: string[];
  previousEnding?: string;
  priorCliffhanger?: string;
  instructions?: string;
}

export interface EpisodeGenerationResult {
  content: EpisodeContent;
  provider: 'chatgpt' | 'claude' | 'ollama';
  attempts: number;
}

export const SYSTEM_PROMPT = [
  'You are a gifted serial-fiction writer working for an African media brand. Readers come back',
  'for the next episode because every episode is a pleasure to read on its own and pulls the',
  'story forward.',
  '',
  'Craft rules:',
  '- Open inside a scene, already in motion. The first sentence must earn the second.',
  '- Write vivid, specific prose: concrete sensory detail, named places and people, natural',
  '  dialogue. Show feeling through action and speech instead of explaining it.',
  '- Vary the rhythm. Keep paragraphs short enough to read comfortably on a phone.',
  '- Avoid clichés and filler ("little did they know", "a shiver ran down", "heart pounded",',
  '  "suddenly"), stock names and summary narration.',
  '- Keep every fact consistent with the story so far: names, ages, relationships, places and',
  '  timeline. Never contradict earlier events and never introduce a known character again.',
  '- Each episode has its own small arc (a want, an obstacle, a turn) and ends on a turn that',
  '  makes the reader need the next one.',
  '- The body is the story only: no episode numbers, no headings, no markdown, no notes to the',
  '  reader, no mention of AI or of this being a series.',
  '',
  'Return one JSON object and nothing else: no text before or after it, no markdown fences.',
].join('\n');

export function userPrompt(brief: EpisodeBrief, complaint?: string): string {
  const lines = [
    `Story: ${brief.storyTitle}`,
    `Premise: ${brief.premise}`,
    brief.genre ? `Genre: ${brief.genre}` : '',
    `Language: ${brief.language}`,
    brief.audience ? `Audience: ${brief.audience}` : '',
    brief.tone ? `Tone: ${brief.tone}` : '',
    `This is episode ${brief.episodeNumber}. Write between 900 and 1,300 words.`,
    ...storySoFar(brief),
    brief.priorCliffhanger
      ? `Pick up from this cliffhanger: ${brief.priorCliffhanger}`
      : 'This opens the series — start inside a scene that hooks the reader in the first ' +
        'paragraph and introduces the main character through action.',
    brief.instructions ? `Additional direction: ${brief.instructions}` : '',
    '',
    'Return JSON in exactly this shape:',
    '{',
    '  "title": "episode title, evocative, at most six words",',
    '  "hook": "one or two sentences that tease the episode without spoiling it",',
    '  "body": "the full episode as plain prose, paragraphs separated by \\n\\n",',
    '  "cliffhanger": "the turn the episode ends on, in one sentence",',
    '  "summary": "three or four sentences stating exactly what happens in this episode, ' +
      'with names",',
    '  "continuity_notes": ["up to eight short facts a later episode must stay consistent with"],',
    '  "themes": ["short theme tags"],',
    '  "content_warnings": ["only if genuinely warranted"],',
    '  "promotion_caption": "a short teaser line in the story\'s own voice, no emojis",',
    '  "promotion_hashtags": ["#like", "#this"]',
    '}',
  ];
  if (complaint) {
    lines.push('', `Your previous attempt was rejected: ${complaint}`, 'Fix it and return JSON.');
  }
  return lines.filter(Boolean).join('\n');
}

function storySoFar(brief: EpisodeBrief): string[] {
  const out: string[] = [];

  if (brief.priorEpisodes.length) {
    out.push(
      'Story so far:',
      ...brief.priorEpisodes.map(
        episode => `Episode ${episode.episodeNumber} — ${episode.title}: ${episode.summary}`
      )
    );
  }
  if (brief.continuityNotes.length) {
    out.push('Facts to keep consistent:', ...brief.continuityNotes.map(note => `- ${note}`));
  }
  if (brief.previousEnding) {
    out.push(`The previous episode closed with: "${brief.previousEnding}"`);
  }

  return out;
}

function parseCandidate(raw: string): { content?: EpisodeContent; complaint?: string } {
  let candidate: unknown;
  try {
    candidate = parseLenientJson(extractJson(raw));
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
  const { credentials, model } = await resolveChatGptConfig();
  const items = await runChatGpt({
    credentials,
    logger,
    services: nodeServices,
    usageContext: { requestId, userId },
    parameters: {
      resource: 'text',
      operation: 'message',
      model: model ?? env.STORY_LLM_CHATGPT_MODEL,
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
  const { credentials, model } = await resolveClaudeConfig();
  const items = await runClaude({
    credentials,
    logger,
    services: nodeServices,
    usageContext: { requestId, userId },
    parameters: {
      resource: 'text',
      operation: 'message',
      model: model ?? env.STORY_LLM_CLAUDE_MODEL,
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
    const chain: Array<'chatgpt' | 'claude' | 'ollama'> = ['claude', 'chatgpt', 'ollama'];
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
