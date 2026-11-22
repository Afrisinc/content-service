import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';

const E2E_URL = process.env.NEWS_FLOW_E2E_DATABASE_URL;

if (E2E_URL) {
  process.env.JWT_SECRET = 'e2e-jwt-secret';
  process.env.CONTENT_ENCRYPTION_KEY = 'e2e-encryption-key-0123456789abcdef';
  process.env.SERVICE_SECRET = process.env.SERVICE_SECRET || 'e2e-service-secret';
}

const generateJson = vi.hoisted(() => vi.fn());
vi.mock('@/services/jsonLlm.service', () => ({ generateJson }));

const { prisma } = await import('@/database/prismaClient');
const { errorHandler } = await import('@/middlewares/errorHandler');
const { analyticsRoutes } = await import('@/routes/analytics.routes');

const suite = E2E_URL ? describe : describe.skip;

const DAY = 24 * 60 * 60 * 1000;
const USER = 'plan-user';

function assertScratchDatabase() {
  const url = new URL(E2E_URL as string);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`refusing to run the posting plan e2e against ${url.hostname}`);
  }
  if (process.env.DATABASE_URL !== E2E_URL) {
    throw new Error('DATABASE_URL must equal NEWS_FLOW_E2E_DATABASE_URL for this suite');
  }
}

async function seed() {
  assertScratchDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE social_media_posts, account_groups, social_media_accounts, users ' +
      'RESTART IDENTITY CASCADE'
  );

  await prisma.user.create({ data: { id: USER, email: 'plan@afrisinc.test', password: 'x' } });

  const brand = async (name: string, isDefault: boolean, pages: string[]) => {
    const group = await prisma.accountGroup.create({
      data: {
        userId: USER,
        name,
        slug: name.toLowerCase(),
        isDefault,
        slotWeekdays: '1,3,5',
        slotHour: 9,
        timezone: 'Africa/Kigali',
        audience: 'founders',
      },
    });
    for (const pageId of pages) {
      const [platform] = pageId.split(':');
      const account = await prisma.socialMediaAccount.create({
        data: { userId: USER, platform, pageId, pageName: pageId },
      });
      await prisma.accountGroupMember.create({
        data: { groupId: group.id, accountId: account.id },
      });
    }
    return group;
  };

  const main = await brand('Main', true, ['instagram:ig-main', 'facebook:fb-main']);
  const side = await brand('Side', false, ['instagram:ig-side']);

  const now = Date.now();
  const post = (pageId: string, mediaType: string, likes: number, ageDays: number, saves = 0) => {
    const [platform] = pageId.split(':');
    return {
      userId: USER,
      platform,
      pageId,
      status: 'published',
      mediaType,
      postFormat: 'feed' as const,
      publishedAt: new Date(now - ageDays * DAY),
      lastMetricsUpdate: new Date(now - DAY / 2),
      likes,
      reach: 1000,
      saves,
      tags: mediaType === 'carousel' ? ['#Fintech'] : ['#Policy'],
    };
  };

  await prisma.socialMediaPost.createMany({
    data: [
      ...[3, 4, 5, 6].map(age => post('instagram:ig-main', 'carousel', 60, age, 12)),
      ...[7, 8, 9, 10].map(age => post('instagram:ig-main', 'image', 20, age, 2)),
      post('instagram:ig-main', 'image', 0, 1),
      ...[3, 4, 5, 6, 7, 8].map(age => post('instagram:ig-side', 'image', 500, age)),
    ],
  });

  return { main, side };
}

suite('posting plan and post ideas against Postgres', () => {
  const app = Fastify();
  const token = jwt.sign(
    { sub: USER, email: 'plan@afrisinc.test', role: 'member' },
    'e2e-jwt-secret'
  );
  const auth = { authorization: `Bearer ${token}` };
  let brands: Awaited<ReturnType<typeof seed>>;

  beforeAll(async () => {
    app.setErrorHandler(errorHandler);
    await app.register(analyticsRoutes);
    await app.ready();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    brands = await seed();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("plans the default brand on its own accounts' numbers only", async () => {
    const response = await app.inject({ method: 'GET', url: '/analytics/plan', headers: auth });

    expect(response.statusCode).toBe(200);
    const plan = response.json().data;
    expect(plan.brand).toEqual({ id: brands.main.id, name: 'Main' });
    expect(plan.postsPublished).toBe(9);
    expect(plan.postsAnalysed).toBe(8);
    expect(plan.metric).toBe('rate');
    expect(new Set(plan.slots.map((slot: { platform: string }) => slot.platform))).toEqual(
      new Set(['instagram', 'facebook'])
    );
    expect(plan.topics[0].topic).toBe('Fintech');
    expect(plan.slots[0].format).toBe('post');
    const kinds = plan.recommendations.map((entry: { kind: string }) => entry.kind);
    expect(kinds).toContain('format');
    expect(kinds).toContain('intent');
    expect(
      plan.recommendations.find((entry: { kind: string }) => entry.kind === 'format').title
    ).toBe('Carousels earn 3.3× the engagement');
  });

  it('plans another brand when asked, and refuses a brand the user does not own', async () => {
    const side = await app.inject({
      method: 'GET',
      url: `/analytics/plan?groupId=${brands.side.id}`,
      headers: auth,
    });
    expect(side.json().data).toMatchObject({ brand: { name: 'Side' }, postsPublished: 6 });

    const stranger = await app.inject({
      method: 'GET',
      url: '/analytics/plan?groupId=not-mine',
      headers: auth,
    });
    expect(stranger.statusCode).toBe(404);
  });

  it('turns the plan into one idea per slot, grounded in the brand', async () => {
    generateJson.mockImplementation(async (request: { prompt: () => string }) => ({
      provider: 'claude',
      attempts: 1,
      value: {
        ideas: [
          {
            slot: 0,
            hook: 'The three questions every fintech founder dodges',
            angle: 'A checklist.',
          },
        ],
      },
      prompt: request.prompt(),
    }));

    const response = await app.inject({
      method: 'POST',
      url: '/analytics/plan/ideas',
      headers: auth,
      payload: { groupId: brands.main.id },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.ideas[0]).toMatchObject({
      slot: 0,
      hook: 'The three questions every fintech founder dodges',
    });
    const prompt = generateJson.mock.calls[0][0].prompt();
    expect(prompt).toContain('Brand: Main');
    expect(prompt).toContain('Audience: founders');
    expect(prompt).toContain('What has landed best recently: Fintech');
  });

  it('drops a field the endpoint does not know, so a caller cannot pick the model', async () => {
    generateJson.mockResolvedValue({
      provider: 'claude',
      attempts: 1,
      value: { ideas: [{ slot: 0, hook: 'A hook long enough', angle: 'An angle long enough.' }] },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/analytics/plan/ideas',
      headers: auth,
      payload: { groupId: brands.main.id, model: 'gpt-5' },
    });

    expect(response.statusCode).toBe(200);
    expect(generateJson.mock.calls[0][0]).toMatchObject({ chatGptModel: 'gpt-4o' });
  });
});
