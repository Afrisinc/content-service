import { z } from 'zod';
import { env } from '@/config/env';
import { platformName } from '@/helpers/analyticsInsights.helper';
import { generateJson, type JsonLlmProvider } from '@/services/jsonLlm.service';
import {
  postingPlanService,
  type PostingPlan,
  type PostingPlanService,
} from '@/services/postingPlan.service';
import { cacheGet, cacheSet } from '@/utils/cache';
import { BadRequestError } from '@/utils/http-error';

export const MAX_IDEAS = 7;
const IDEAS_TTL_SECONDS = 6 * 60 * 60;
const MAX_ATTEMPTS = 2;
const MAX_TOTAL_ATTEMPTS = 3;
const TEMPERATURE = 0.7;

const FORMAT_GUIDANCE: Record<string, string> = {
  post: 'a carousel: the hook promises a list, steps or a framework the slides deliver',
  single: 'a single image: one bold, specific claim or question that stands on its own',
  story: 'a story frame: a quick question, poll or behind-the-scenes moment',
};

export const ideasSchema = z.object({
  ideas: z
    .array(
      z.object({
        slot: z.number().int().min(0),
        hook: z.string().trim().min(10).max(140),
        angle: z.string().trim().min(10).max(400),
      })
    )
    .min(1)
    .max(MAX_IDEAS),
});

export interface PostIdea {
  slot: number;
  when: string;
  platform: string;
  format: string;
  topic: string | null;
  hook: string;
  angle: string;
}

export interface PostIdeas {
  generatedAt: string;
  provider: JsonLlmProvider;
  ideas: PostIdea[];
}

export const IDEAS_SYSTEM_PROMPT = [
  'You are a senior social media strategist for an African business media brand.',
  'You turn a posting plan into concrete post ideas a writer can start on immediately.',
  '',
  'Rules:',
  '- One idea per planned post. Every idea takes a different angle; never repeat a hook.',
  '- The hook is the first line a reader sees: specific, concrete and under 120 characters.',
  '  It earns attention with a real tension, question or useful promise, never with clickbait.',
  '- Never state a statistic, figure, date, name or fact you were not given. If an idea needs',
  '  a number, the angle says what to find out instead of inventing it.',
  '- Fit the format and the platform: LinkedIn reads professional, Instagram visual and',
  '  personal, Facebook conversational.',
  '- No emojis, no hashtags, no exclamation marks, no "Did you know", no "In today\'s world".',
  '- The angle says in one or two sentences what the post argues or shows and why this',
  '  audience will save or share it.',
  '',
  'Return one JSON object and nothing else.',
].join('\n');

function slotLine(plan: PostingPlan, index: number): string {
  const slot = plan.slots[index];
  const when = new Date(slot.when).toLocaleString('en-GB', {
    timeZone: plan.timeZone,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
  const guidance = FORMAT_GUIDANCE[slot.format] ?? slot.format;
  return (
    `${index}. ${when} on ${platformName(slot.platform)}, ${guidance}. ` +
    `Subject: ${slot.topic ?? 'open — pick the strongest subject for this brand'}.`
  );
}

export function ideasPrompt(plan: PostingPlan, count: number, complaint?: string): string {
  const profile = plan.brandProfile;
  const lines = [
    `Brand: ${plan.brand?.name ?? 'Unnamed brand'}`,
    profile?.description ? `About: ${profile.description}` : '',
    profile?.serviceLine ? `What it offers: ${profile.serviceLine}` : '',
    profile?.audience ? `Audience: ${profile.audience}` : '',
    profile?.topics.length ? `Its usual subjects: ${profile.topics.join(', ')}` : '',
    '',
    plan.topics.length
      ? `What has landed best recently: ${plan.topics.map(topic => topic.topic).join(', ')}`
      : 'There is not enough evidence yet on which subjects land best.',
    ...plan.recommendations.map(entry => `Finding: ${entry.title}. ${entry.detail}`),
    '',
    'Planned posts:',
    ...Array.from({ length: count }, (_, index) => slotLine(plan, index)),
    '',
    'Return JSON shaped exactly like:',
    '{ "ideas": [ { "slot": 0, "hook": "the opening line",',
    '  "angle": "what the post argues and why it gets saved" } ] }',
    `Give exactly ${count} ideas, one for each planned post, using its number as "slot".`,
  ];
  if (complaint) {
    lines.push('', `Your previous answer was rejected: ${complaint}`, 'Fix it and return JSON.');
  }
  return lines.filter(line => line !== '').join('\n');
}

function ideasKey(userId: string, groupId: string | undefined, plan: PostingPlan): string {
  return `analytics:ideas:${userId}:${groupId ?? 'default'}:${plan.slots
    .slice(0, MAX_IDEAS)
    .map(slot => `${slot.when}|${slot.platform}|${slot.format}|${slot.topic ?? ''}`)
    .join(',')}`;
}

export class PostIdeasService {
  constructor(
    private readonly plans: Pick<PostingPlanService, 'build'> = postingPlanService,
    private readonly generate: typeof generateJson = generateJson
  ) {}

  async suggest(
    userId: string,
    window: { from: Date; to: Date },
    options: { groupId?: string; refresh?: boolean } = {}
  ): Promise<PostIdeas> {
    const plan = await this.plans.build(userId, window.from, window.to, options.groupId);
    if (!plan.brand || !plan.slots.length) {
      throw new BadRequestError('set up a brand with posting days before asking for post ideas');
    }

    const key = ideasKey(userId, options.groupId, plan);
    if (!options.refresh) {
      const cached = await cacheGet<PostIdeas>(key);
      if (cached) {
        return cached;
      }
    }

    const count = Math.min(MAX_IDEAS, plan.slots.length);
    const { value, provider } = await this.generate({
      system: IDEAS_SYSTEM_PROMPT,
      prompt: complaint => ideasPrompt(plan, count, complaint),
      schema: ideasSchema,
      requestId: `post-ideas:${userId}`,
      userId,
      claudeModel: env.POST_IDEAS_CLAUDE_MODEL,
      chatGptModel: env.POST_IDEAS_CHATGPT_MODEL,
      maxTokens: env.POST_IDEAS_MAX_TOKENS,
      temperature: TEMPERATURE,
      maxAttempts: MAX_ATTEMPTS,
      maxTotalAttempts: MAX_TOTAL_ATTEMPTS,
    });

    const used = new Set<number>();
    const ideas = value.ideas
      .filter(idea => idea.slot < count && !used.has(idea.slot) && used.add(idea.slot))
      .sort((a, b) => a.slot - b.slot)
      .map(idea => {
        const slot = plan.slots[idea.slot];
        return {
          slot: idea.slot,
          when: slot.when,
          platform: slot.platform,
          format: slot.format,
          topic: slot.topic,
          hook: idea.hook,
          angle: idea.angle,
        };
      });

    const result: PostIdeas = { generatedAt: new Date().toISOString(), provider, ideas };
    await cacheSet(key, result, IDEAS_TTL_SECONDS);
    return result;
  }
}

export const postIdeasService = new PostIdeasService();
