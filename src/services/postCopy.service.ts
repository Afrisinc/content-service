import {
  BANNED_CONSTRUCTIONS,
  BANNED_WORDS,
  ROWS_PER_METHOD_SLIDE,
  SINGLE_BRIEF_NOTE,
  SLIDE_COUNTS,
  slideCountFor,
  SPEC_SCHEMA_PROMPT,
  STORY_BRIEF_NOTE,
  VOICE_PROMPT,
} from '@/brand/afrisinc.brand';
import { env } from '@/config/env';
import { ClaudeNode, claudeCredentialsFromEnv, runClaude } from '@/nodes';
import { PostBriefPayload, PostCopy, PostFormatName } from '@/types/post.types';
import { BadRequestError, ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { z } from 'zod';

const rowSchema = z.object({
  title: z.string().min(2).max(40),
  body: z.string().min(2).max(90),
});

const slideSchema = z.object({
  role: z.enum(['hook', 'proof', 'method', 'differentiator', 'cta']),
  eyebrow: z.string().min(2).max(48),
  eyebrowKind: z.enum(['label', 'claim']),
  headline: z.array(z.string().min(1)).min(1).max(4),
  subs: z.array(z.string().min(2)).max(2).optional(),
  rows: z.array(rowSchema).optional(),
  closing: z.string().max(90).optional(),
  cta: z.string().max(32).optional(),
  strikeWord: z.string().max(24).optional(),
  photoSubjects: z.array(z.string().min(2)).optional(),
});

function copySchemaFor(format: PostFormatName, requested?: number) {
  const { min } = SLIDE_COUNTS[format];
  const max = slideCountFor(format, requested);
  return z.object({
    concept: z.string().min(8),
    caption: z.string().min(40),
    hashtags: z.array(z.string().startsWith('#')).min(8).max(20),
    claims: z.array(z.string()),
    slides: z.array(slideSchema).min(Math.min(min, max)).max(max),
  });
}

export class VoiceViolationError extends BadRequestError {}

export class CopyBudgetExceededError extends ServerError {}

/**
 * The model produced something unusable — cut off, wrapped in prose, or not JSON
 * at all. Worth another attempt with the complaint fed back, which is what
 * separates it from an outage.
 */
export class CopyUnusableError extends ServerError {}

/**
 * A node of its own so the copy agent gets its own timeout and retry budget
 * rather than the SDK's ten-minute default, which a post this small should never
 * come close to.
 */
const copyNode = new ClaudeNode({
  clientOptions: {
    timeoutMs: env.POST_AGENT_TIMEOUT_MS,
    retry: { retries: env.POST_AGENT_RETRIES },
  },
});

export function findVoiceViolations(copy: PostCopy, format: PostFormatName = 'post'): string[] {
  const problems: string[] = [];
  const prose = [
    copy.caption,
    ...copy.slides.flatMap(slide => [
      slide.eyebrow,
      ...slide.headline,
      ...(slide.subs ?? []),
      slide.closing ?? '',
      ...(slide.rows ?? []).flatMap(row => [row.title, row.body]),
    ]),
  ]
    .join(' ')
    .toLowerCase();

  for (const word of BANNED_WORDS) {
    if (prose.includes(word)) {
      problems.push(`banned word "${word}"`);
    }
  }
  for (const pattern of BANNED_CONSTRUCTIONS) {
    if (pattern.test(prose)) {
      problems.push(`banned construction ${pattern.source}`);
    }
  }

  const emDashes = (copy.caption.match(/—/g) ?? []).length;
  if (emDashes > 1) {
    problems.push(`${emDashes} em dashes in the caption, limit 1`);
  }

  const methodSlide = copy.slides.find(slide => slide.role === 'method');
  if (methodSlide && (methodSlide.rows?.length ?? 0) !== ROWS_PER_METHOD_SLIDE) {
    problems.push(`the method slide carries ${methodSlide.rows?.length ?? 0} rows, needs 3`);
  }

  const ctaSlide = copy.slides[copy.slides.length - 1];
  if (ctaSlide?.role !== 'cta') {
    problems.push('the last slide must be the cta');
  }
  // Only a carousel is a sequence; a story or a single frame stands alone.
  if (format === 'post' && copy.slides[0]?.role !== 'hook') {
    problems.push('the first slide must be the hook');
  }

  return problems;
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new CopyUnusableError('the copy agent did not return JSON');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new CopyUnusableError('the copy agent returned malformed JSON');
  }
}

function briefPrompt(brief: PostBriefPayload, complaint?: string): string {
  const format = brief.format ?? 'post';
  const formatNote =
    format === 'story' ? STORY_BRIEF_NOTE : format === 'single' ? SINGLE_BRIEF_NOTE : '';
  const lines = [
    formatNote,
    `Topic: ${brief.topic}`,
    brief.serviceLine ? `Service line: ${brief.serviceLine}` : '',
    brief.offer ? `Offer to lead the CTA with: ${brief.offer}` : '',
    brief.audience ? `Audience: ${brief.audience}` : '',
    `Slides: exactly ${slideCountFor(format, brief.slideCount)}`,
    '',
    'Return JSON in exactly this shape:',
    SPEC_SCHEMA_PROMPT,
  ];
  if (complaint) {
    lines.push('', `Your previous attempt was rejected: ${complaint}`, 'Fix it and return JSON.');
  }
  return lines.filter(Boolean).join('\n');
}

export class PostCopyService {
  async generate(
    brief: PostBriefPayload,
    signal?: AbortSignal
  ): Promise<{ copy: PostCopy; attempts: number }> {
    let complaint: string | undefined;

    const format = brief.format ?? 'post';
    const schema = copySchemaFor(format, brief.slideCount);
    const deadline = Date.now() + env.POST_AGENT_BUDGET_MS;

    for (let attempt = 1; attempt <= env.POST_AGENT_MAX_ATTEMPTS; attempt += 1) {
      // Checked before each attempt rather than only at the end: a run that has
      // already spent its budget must stop, not start another minute of work.
      if (Date.now() >= deadline) {
        throw new CopyBudgetExceededError(
          `the copy agent ran out of time after ${attempt - 1} attempts` +
            (complaint ? `: ${complaint}` : '')
        );
      }

      let candidate: unknown;
      try {
        const raw = await this.callModel(brief, complaint, signal);
        candidate = extractJson(raw);
      } catch (error) {
        // A response that came back unusable is a bad attempt, not a dead run —
        // the loop already exists to complain and try again.
        if (!(error instanceof CopyUnusableError)) {
          throw error;
        }
        complaint = `${error.message}. Reply with one JSON object and nothing else.`;
        logger.warn({ attempt, complaint }, 'Copy agent returned an unusable response');
        continue;
      }

      const parsed = schema.safeParse(candidate);
      if (!parsed.success) {
        complaint = parsed.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        logger.warn({ attempt, complaint }, 'Copy agent returned an invalid shape');
        continue;
      }

      const violations = findVoiceViolations(parsed.data, format);
      if (violations.length) {
        complaint = violations.join('; ');
        logger.warn({ attempt, complaint }, 'Copy agent breached the voice rules');
        continue;
      }

      return { copy: parsed.data, attempts: attempt };
    }

    // The last complaint says what actually went wrong — a voice breach, a shape
    // the schema rejected, or a response that never parsed. Reporting all three
    // as a brand-rules failure sends the reader looking in the wrong place.
    throw new VoiceViolationError(
      `the copy agent could not produce usable copy in ${env.POST_AGENT_MAX_ATTEMPTS} attempts: ` +
        `${complaint}`
    );
  }

  private async callModel(
    brief: PostBriefPayload,
    complaint?: string,
    signal?: AbortSignal
  ): Promise<string> {
    try {
      const items = await runClaude({
        node: copyNode,
        signal,
        credentials: claudeCredentialsFromEnv(),
        logger,
        parameters: {
          resource: 'text',
          operation: 'message',
          model: env.POST_AGENT_MODEL,
          maxTokens: env.POST_AGENT_MAX_TOKENS,
          systemPrompt: VOICE_PROMPT,
          prompt: briefPrompt(brief, complaint),
        },
      });

      logger.debug({ items }, 'Claude response received');

      if (!items || items.length === 0) {
        throw new ServerError('Claude returned no items');
      }

      const item = items[0];
      if (item.error) {
        throw new ServerError(`Claude error: ${JSON.stringify(item.error)}`);
      }

      const content = item.json?.content;
      if (item.json?.refused) {
        throw new ServerError(
          `Claude declined the request: ${item.json?.refusalCategory || 'unknown reason'}`
        );
      }

      if (typeof content !== 'string' || !content.trim()) {
        logger.error({ json: item.json }, 'Claude response missing content');
        throw new ServerError('the copy agent returned nothing');
      }

      // Hitting the token ceiling cuts the object off mid-write, so the JSON is
      // invalid for a reason worth naming rather than reporting as malformed.
      if (item.json?.stopReason === 'max_tokens') {
        throw new CopyUnusableError(
          `the copy agent ran past its ${env.POST_AGENT_MAX_TOKENS}-token limit and was ` +
            'cut off — ask for fewer frames, or raise POST_AGENT_MAX_TOKENS'
        );
      }

      return content;
    } catch (err) {
      if (err instanceof ServerError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ServerError(`Claude API error: ${message}`);
    }
  }
}

export const postCopyService = new PostCopyService();
