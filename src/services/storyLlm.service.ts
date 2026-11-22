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
const LABEL_LINE = new RegExp(
  [
    '^[ \\t]*(?:',
    '(?:episode|chapter|part)[ \\t]+\\d+[ \\t]*(?:[:.\\-–—][^\\n]{0,80})?',
    '|#{1,6}[ \\t][^\\n]{0,100}',
    ')[ \\t]*$',
  ].join(''),
  'gim'
);
const LABEL_OR_HEADING = new RegExp(LABEL_LINE.source, 'im');
const MAX_HASHTAGS = 10;
const MAX_TAGS = 6;
const MAX_NOTES = 8;

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
  story_so_far: z.string().min(60).max(1800),
  continuity_notes: z.array(z.string().min(3).max(160)).max(8).default([]),
  themes: z.array(z.string().max(80)).max(6).default([]),
  content_warnings: z.array(z.string().max(160)).max(6).default([]),
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
  storySoFar?: string;
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
  '- Write the hook and the promotion caption as a stranger scrolling a feed would need them:',
  '  concrete, present tense, one specific image or question from this episode, no spoilers, no',
  '  summary words ("mysterious", "emerges", "journey", "unravel") and no "are you ready".',
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
    '  "hook": "one or two present-tense sentences built on a specific image or question ' +
      'from this episode, without spoiling it",',
    '  "body": "the full episode as plain prose, paragraphs separated by \\n\\n",',
    '  "cliffhanger": "the turn the episode ends on, in one sentence",',
    '  "summary": "three or four sentences stating exactly what happens in this episode, ' +
      'with names",',
    '  "story_so_far": "the whole story from episode one to the end of this episode in at ' +
      'most 220 words, with names, updating the synopsis you were given",',
    '  "continuity_notes": ["up to eight short facts a later episode must stay consistent with"],',
    '  "themes": ["short theme tags"],',
    '  "content_warnings": ["only if genuinely warranted"],',
    '  "promotion_caption": "one or two sentences in the story\'s own voice that stop a ' +
      'scrolling reader, naming something concrete, no emojis and no call to action",',
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
  const episodes = brief.priorEpisodes.map(
    episode => `Episode ${episode.episodeNumber} — ${episode.title}: ${episode.summary}`
  );

  if (brief.storySoFar) {
    out.push(`The story until now: ${brief.storySoFar}`);
    if (episodes.length) {
      out.push('Most recent episodes:', ...episodes);
    }
  } else if (episodes.length) {
    out.push('Story so far:', ...episodes);
  }
  if (brief.continuityNotes.length) {
    out.push('Facts to keep consistent:', ...brief.continuityNotes.map(note => `- ${note}`));
  }
  if (brief.previousEnding) {
    out.push(`The previous episode closed with: "${brief.previousEnding}"`);
  }

  return out;
}

function hashtagsFrom(value: unknown[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }
    const word = entry.replace(/^#+/, '').replace(/[^A-Za-z0-9_]/g, '');
    if (word && !seen.has(word.toLowerCase())) {
      seen.add(word.toLowerCase());
      tags.push(`#${word}`);
    }
  }
  return tags.slice(0, MAX_HASHTAGS);
}

export function tidyCandidate(candidate: unknown): unknown {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return candidate;
  }

  const draft: Record<string, unknown> = { ...(candidate as Record<string, unknown>) };
  for (const field of ['title', 'hook', 'cliffhanger', 'summary', 'story_so_far']) {
    if (typeof draft[field] === 'string') {
      draft[field] = (draft[field] as string).trim();
    }
  }
  if (typeof draft.body === 'string') {
    draft.body = draft.body
      .replace(LABEL_LINE, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  if (Array.isArray(draft.promotion_hashtags)) {
    draft.promotion_hashtags = hashtagsFrom(draft.promotion_hashtags);
  }
  for (const [field, limit] of [
    ['continuity_notes', MAX_NOTES],
    ['themes', MAX_TAGS],
    ['content_warnings', MAX_TAGS],
  ] as const) {
    if (Array.isArray(draft[field])) {
      draft[field] = (draft[field] as unknown[]).slice(0, limit);
    }
  }
  return draft;
}

function parseCandidate(raw: string): { content?: EpisodeContent; complaint?: string } {
  let candidate: unknown;
  try {
    candidate = tidyCandidate(parseLenientJson(extractJson(raw)));
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
      jsonOutput: true,
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
      options: { thinking: 'disabled' },
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

type StoryProvider = 'chatgpt' | 'claude' | 'ollama';

const PAID_PROVIDERS: ReadonlySet<StoryProvider> = new Set(['claude', 'chatgpt']);

async function attemptProvider(
  provider: StoryProvider,
  brief: EpisodeBrief,
  requestId: string,
  userId: string,
  budget: { paidLeft: number }
): Promise<EpisodeGenerationResult> {
  const paid = PAID_PROVIDERS.has(provider);
  const allowed = paid
    ? Math.min(env.STORY_LLM_MAX_ATTEMPTS, budget.paidLeft)
    : env.STORY_LLM_MAX_ATTEMPTS;
  let complaint: string | undefined;

  for (let attempt = 1; attempt <= allowed; attempt += 1) {
    const prompt = userPrompt(brief, complaint);
    const raw =
      provider === 'chatgpt'
        ? await generateWithChatGpt(prompt, requestId, userId)
        : provider === 'claude'
          ? await generateWithClaude(prompt, requestId, userId)
          : await generateWithOllama(prompt);
    if (paid) {
      budget.paidLeft -= 1;
    }

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
    const chain: StoryProvider[] = ['claude', 'chatgpt', 'ollama'];
    const failures: string[] = [];
    const budget = { paidLeft: env.STORY_LLM_MAX_PAID_ATTEMPTS };

    for (const provider of chain) {
      if (PAID_PROVIDERS.has(provider) && budget.paidLeft <= 0) {
        failures.push(`${provider}: skipped, the paid attempt budget is spent`);
        continue;
      }
      try {
        return await attemptProvider(provider, brief, requestId, userId, budget);
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
