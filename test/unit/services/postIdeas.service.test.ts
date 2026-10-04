import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '@/utils/http-error';

const cache = vi.hoisted(() => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));

vi.mock('@/config/env', () => ({
  env: {
    POST_IDEAS_CLAUDE_MODEL: 'claude-x',
    POST_IDEAS_CHATGPT_MODEL: 'gpt-x',
    POST_IDEAS_MAX_TOKENS: 2000,
  },
}));
vi.mock('@/utils/cache', () => cache);
vi.mock('@/services/postingPlan.service', () => ({ postingPlanService: { build: vi.fn() } }));
vi.mock('@/services/jsonLlm.service', () => ({ generateJson: vi.fn() }));

const { PostIdeasService, ideasPrompt, ideasSchema, IDEAS_SYSTEM_PROMPT } =
  await import('@/services/postIdeas.service');

const slot = (index: number, overrides = {}) => ({
  when: `2026-10-0${6 + index}T07:00:00.000Z`,
  platform: index % 2 ? 'linkedin' : 'instagram',
  format: index % 2 ? 'single' : 'post',
  topic: index % 2 ? 'Fintech' : null,
  reason: 'r',
  ...overrides,
});

const plan = (slots = [slot(0), slot(1)]) =>
  ({
    timeZone: 'Africa/Kigali',
    brand: { id: 'brand-1', name: 'AFRISINC' },
    brandProfile: {
      description: 'Business media for Africa',
      serviceLine: null,
      audience: 'founders and operators',
      topics: ['fintech', 'policy'],
    },
    topics: [{ topic: 'Fintech', posts: 4, averageEngagement: 9, score: 0.04 }],
    recommendations: [{ kind: 'format', title: 'Carousels earn 2× the engagement', detail: 'd' }],
    slots,
  }) as never;

const window = { from: new Date('2026-09-04'), to: new Date('2026-10-04') };

let plans: { build: ReturnType<typeof vi.fn> };
let generate: ReturnType<typeof vi.fn>;
let service: InstanceType<typeof PostIdeasService>;

beforeEach(() => {
  vi.clearAllMocks();
  plans = { build: vi.fn(async () => plan()) };
  generate = vi.fn(async () => ({
    provider: 'claude',
    attempts: 1,
    value: {
      ideas: [
        { slot: 1, hook: 'Why your bank wants to be an app store', angle: 'Open APIs explained.' },
        {
          slot: 0,
          hook: 'Five questions before you raise in Lagos',
          angle: 'A checklist to save.',
        },
      ],
    },
  }));
  cache.cacheGet.mockResolvedValue(null);
  service = new PostIdeasService(plans, generate as never);
});

describe('PostIdeasService.suggest', () => {
  it('gives each planned post its idea, in plan order', async () => {
    const result = await service.suggest('user-1', window, { groupId: 'brand-1' });

    expect(plans.build).toHaveBeenCalledWith('user-1', window.from, window.to, 'brand-1');
    expect(result.provider).toBe('claude');
    expect(result.ideas).toEqual([
      expect.objectContaining({
        slot: 0,
        when: '2026-10-06T07:00:00.000Z',
        platform: 'instagram',
        format: 'post',
        hook: 'Five questions before you raise in Lagos',
      }),
      expect.objectContaining({ slot: 1, platform: 'linkedin', topic: 'Fintech' }),
    ]);
  });

  it('asks with the grounded system prompt, the configured models and a retry budget', async () => {
    await service.suggest('user-1', window);

    expect(generate.mock.calls[0][0]).toMatchObject({
      system: IDEAS_SYSTEM_PROMPT,
      claudeModel: 'claude-x',
      chatGptModel: 'gpt-x',
      maxTokens: 2000,
      maxAttempts: 2,
      maxTotalAttempts: 3,
      userId: 'user-1',
    });
  });

  it('drops ideas for slots that do not exist and repeated slots', async () => {
    generate.mockResolvedValueOnce({
      provider: 'chatgpt',
      attempts: 1,
      value: {
        ideas: [
          { slot: 0, hook: 'First hook for slot zero', angle: 'An angle that is long enough.' },
          { slot: 0, hook: 'Second hook for slot zero', angle: 'An angle that is long enough.' },
          { slot: 5, hook: 'Hook for a slot that is not there', angle: 'Long enough angle.' },
        ],
      },
    });

    const result = await service.suggest('user-1', window);

    expect(result.ideas.map(idea => idea.hook)).toEqual(['First hook for slot zero']);
  });

  it('serves the saved ideas for the same plan without asking the AI again', async () => {
    cache.cacheGet.mockResolvedValueOnce({ generatedAt: 'x', provider: 'claude', ideas: [] });

    const result = await service.suggest('user-1', window);

    expect(result.generatedAt).toBe('x');
    expect(generate).not.toHaveBeenCalled();
  });

  it('asks again when told to refresh, and saves the new answer for six hours', async () => {
    await service.suggest('user-1', window, { refresh: true });

    expect(cache.cacheGet).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(cache.cacheSet).toHaveBeenCalledWith(
      expect.stringContaining('analytics:ideas:user-1:default:'),
      expect.objectContaining({ provider: 'claude' }),
      21600
    );
  });

  it('caps the request at seven posts', async () => {
    plans.build.mockResolvedValueOnce(plan(Array.from({ length: 10 }, (_, i) => slot(i % 2))));

    await service.suggest('user-1', window);

    const prompt = generate.mock.calls[0][0].prompt();
    expect(prompt).toContain('Give exactly 7 ideas');
  });

  it('refuses when there is no brand or nothing planned, and calls no AI', async () => {
    plans.build.mockResolvedValueOnce({ ...(plan() as object), brand: null });
    await expect(service.suggest('user-1', window)).rejects.toThrow(BadRequestError);

    plans.build.mockResolvedValueOnce(plan([]));
    await expect(service.suggest('user-1', window)).rejects.toThrow(BadRequestError);

    expect(generate).not.toHaveBeenCalled();
  });
});

describe('ideasPrompt', () => {
  it('grounds the ideas in the brand, the evidence and each planned post', () => {
    const prompt = ideasPrompt(plan(), 2);

    expect(prompt).toContain('Brand: AFRISINC');
    expect(prompt).toContain('Audience: founders and operators');
    expect(prompt).toContain('What has landed best recently: Fintech');
    expect(prompt).toContain('Finding: Carousels earn 2× the engagement. d');
    expect(prompt).toContain('0. Tuesday 09:00 on Instagram, a carousel');
    expect(prompt).toContain('Subject: open — pick the strongest subject for this brand.');
    expect(prompt).toContain('1. Wednesday 09:00 on LinkedIn, a single image');
    expect(prompt).toContain('Subject: Fintech.');
    expect(prompt).not.toContain('What it offers');
  });

  it('says so when there is no evidence yet, and repeats a complaint', () => {
    const bare = { ...(plan() as object), topics: [], recommendations: [] } as never;

    const prompt = ideasPrompt(bare, 2, 'ideas.0.hook: too short');

    expect(prompt).toContain('There is not enough evidence yet');
    expect(prompt).toContain('Your previous answer was rejected: ideas.0.hook: too short');
  });
});

describe('the rules the AI is held to', () => {
  it('forbids invented facts, emojis and hashtags', () => {
    expect(IDEAS_SYSTEM_PROMPT).toContain('Never state a statistic, figure, date, name or fact');
    expect(IDEAS_SYSTEM_PROMPT).toContain('No emojis, no hashtags');
  });

  it('rejects a hook that is too long or empty', () => {
    const idea = { slot: 0, angle: 'An angle that is long enough.' };

    expect(ideasSchema.safeParse({ ideas: [{ ...idea, hook: 'x'.repeat(141) }] }).success).toBe(
      false
    );
    expect(ideasSchema.safeParse({ ideas: [{ ...idea, hook: '   ' }] }).success).toBe(false);
    expect(
      ideasSchema.safeParse({
        ideas: [{ slot: 0, hook: 'A good opening line', angle: 'a'.repeat(400) }],
      }).success
    ).toBe(true);
    expect(
      ideasSchema.safeParse({ ideas: [{ ...idea, hook: 'A good opening line' }] }).success
    ).toBe(true);
  });
});
