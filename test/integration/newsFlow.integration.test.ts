import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';

const E2E_URL = process.env.NEWS_FLOW_E2E_DATABASE_URL;

if (E2E_URL) {
  process.env.JWT_SECRET = 'e2e-jwt-secret';
  process.env.CONTENT_ENCRYPTION_KEY = 'e2e-encryption-key-0123456789abcdef';
  process.env.SERVICE_SECRET = process.env.SERVICE_SECRET || 'e2e-service-secret';
  process.env.NEWS_RSS_SOURCES = JSON.stringify([
    { name: 'Test Feed', url: 'https://feed.test/rss', category: 'tech' },
  ]);
  delete process.env.NEWS_ENHANCE_BATCH_SIZE;
  delete process.env.NEWS_MIN_SCORE;
}

const e2e = { url: E2E_URL };

const { prisma } = await import('@/database/prismaClient');
const { errorHandler } = await import('@/middlewares/errorHandler');
const { newsDeskRoutes } = await import('@/routes/newsDesk.routes');
const { AgentRunRecorder } = await import('@/services/agentRunRecorder.service');
const { AutomationService } = await import('@/services/automation.service');
const { resolveChatGptConfig } = await import('@/services/aiCredentials.service');
const { aiProviderConfigService } = await import('@/services/aiProviderConfig.service');
const { NewsAgentService } = await import('@/services/newsAgent.service');
const { NewsEnhancementService } = await import('@/services/newsEnhancement.service');
const { NewsIngestionService } = await import('@/services/newsIngestion.service');

const suite = e2e.url ? describe : describe.skip;

interface FeedEntry {
  guid: string;
  title: string;
  summary: string;
}

const feed = (entries: FeedEntry[]) =>
  '<rss><channel>' +
  entries
    .map(
      entry =>
        `<item><title>${entry.title}</title><guid>${entry.guid}</guid>` +
        `<link>https://example.africa/${entry.guid}</link>` +
        `<description>${entry.summary}</description></item>`
    )
    .join('') +
  '</channel></rss>';

const THREE_ITEMS: FeedEntry[] = [
  { guid: 'g-1', title: 'Kenya opens M-Pesa API', summary: 'Regulators agree on one standard.' },
  { guid: 'g-2', title: 'Lagos fintech raises seed round', summary: 'A new payments startup.' },
  { guid: 'g-3', title: 'Ghana central bank updates rules', summary: 'New licensing for lenders.' },
];

const goodReply = (slug = 'mpesa-open-api') => ({
  score: 0.8,
  should_publish: true,
  title: "M-Pesa's open API could reshape banking",
  slug,
  excerpt: 'One standard for the region.',
  content: `<h2>Why it matters</h2><p>${'word '.repeat(200)}</p>`,
  tags: ['fintech'],
  category: 'fintech',
  image_prompt: 'A Nairobi banking hall',
});

const rejectedReply = (reason: string | null = 'No African business angle') => ({
  score: 0.21,
  should_publish: false,
  reject_reason: reason,
});

function assertScratchDatabase() {
  const url = new URL(e2e.url as string);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`refusing to run the news flow e2e against ${url.hostname}`);
  }
  if (process.env.DATABASE_URL !== e2e.url) {
    throw new Error('DATABASE_URL must equal NEWS_FLOW_E2E_DATABASE_URL for this suite');
  }
}

async function resetDatabase() {
  assertScratchDatabase();
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE n8n_articles, media_posts, agent_runs, agent_settings, ai_provider_configs, ' +
      'automation_policies, account_groups, social_media_accounts, users RESTART IDENTITY CASCADE'
  );
}

async function articleStatuses() {
  const rows = await prisma.n8nArticle.findMany({ orderBy: { id: 'asc' } });
  return rows.map(row => row.status);
}

async function newsRuns() {
  return prisma.agentRun.findMany({
    where: { agent: 'news' },
    include: { steps: { orderBy: { sequence: 'asc' } } },
    orderBy: { startedAt: 'asc' },
  });
}

suite('news flow, end to end against a real database', () => {
  const deps = {
    writeArticle: vi.fn(),
    drawCover: vi.fn(async () => Buffer.from('png')),
    storeCover: vi.fn(async (_image: Buffer, filename: string) => `https://cdn.test/${filename}`),
    postToSocial: vi.fn(),
  };
  const postAgent = {
    createFromBrief: vi.fn(),
    approve: vi.fn(),
  };
  const automation = new AutomationService(undefined, undefined, undefined, postAgent as never);
  deps.postToSocial.mockImplementation(source => automation.draftNewsPosts(source));
  let currentFeed: FeedEntry[] = THREE_ITEMS;
  let feedError: Error | null = null;

  const ingestion = new NewsIngestionService(async () => {
    if (feedError) {
      throw feedError;
    }
    return feed(currentFeed);
  });
  const enhancement = new NewsEnhancementService(deps);
  const agent = new NewsAgentService(ingestion, enhancement, new AgentRunRecorder());

  const app = Fastify();
  const token = jwt.sign(
    { sub: 'editor-1', email: 'editor@afrisinc.test', role: 'editor' },
    'e2e-jwt-secret'
  );
  const auth = { authorization: `Bearer ${token}` };

  beforeAll(async () => {
    assertScratchDatabase();
    app.setErrorHandler(errorHandler);
    await app.register(newsDeskRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    vi.clearAllMocks();
    currentFeed = THREE_ITEMS;
    feedError = null;
    deps.writeArticle.mockResolvedValue(goodReply());
    deps.postToSocial.mockImplementation(source => automation.draftNewsPosts(source));
    let drafted = 0;
    postAgent.createFromBrief.mockImplementation(async () => ({
      id: `draft-${(drafted += 1)}`,
      status: 'awaiting_approval',
      socialPostIds: [],
    }));
    postAgent.approve.mockImplementation(async (id: string) => ({
      id,
      status: 'scheduled',
      socialPostIds: ['post-1'],
    }));
  });

  describe('fetching feeds', () => {
    it('queues new items once and never queues the same item twice', async () => {
      const first = await agent.runIngestion('manual');
      const second = await agent.runIngestion('manual');

      expect(first).toMatchObject({ fetched: 3, created: 3, duplicates: 0 });
      expect(second).toMatchObject({ fetched: 3, created: 0, duplicates: 3 });
      expect(await articleStatuses()).toEqual(['draft', 'draft', 'draft']);
    });

    it('leaves out items that are too old and says how many in the run', async () => {
      const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3600_000).toUTCString();
      const dated = (guid: string, hours: number) =>
        `<item><title>${guid}</title><guid>${guid}</guid>` +
        `<link>https://example.africa/${guid}</link>` +
        `<pubDate>${hoursAgo(hours)}</pubDate></item>`;
      const oldAndNew = new NewsIngestionService(
        async () =>
          '<rss><channel>' +
          dated('fresh', 2) +
          dated('stale-1', 200) +
          dated('stale-2', 5000) +
          '</channel></rss>'
      );
      const dated_agent = new NewsAgentService(oldAndNew, enhancement, new AgentRunRecorder());

      const result = await dated_agent.runIngestion('manual');

      expect(result).toMatchObject({ fetched: 3, created: 1, stale: 2 });
      expect(await articleStatuses()).toEqual(['draft']);
      const [run] = await newsRuns();
      expect(run.steps[0].detail).toBe('3 items read · 1 new · 2 too old');
    });

    it('reads no more than the configured number of items from a feed', async () => {
      const many = new NewsIngestionService(async () =>
        feed(
          Array.from({ length: 8 }, (_, index) => ({
            guid: `many-${index}`,
            title: `Story ${index}`,
            summary: 'Summary',
          }))
        )
      );

      const result = await many.run();

      expect(result.fetched).toBe(3);
      expect(await articleStatuses()).toHaveLength(3);
    });

    it('records the fetch as a succeeded workspace run', async () => {
      await agent.runIngestion('schedule');

      const [run] = await newsRuns();
      expect(run).toMatchObject({
        userId: 'workspace',
        status: 'succeeded',
        topic: 'Fetch news feeds',
      });
      expect(run.steps[0]).toMatchObject({ key: 'run', status: 'succeeded' });
      expect(run.steps[0].detail).toBe('3 items read · 3 new');
    });

    it('records a run as failed, naming the feed, when every feed is down', async () => {
      feedError = new Error('connect ETIMEDOUT');

      await agent.runIngestion('schedule');

      const [run] = await newsRuns();
      expect(run.status).toBe('failed');
      expect(run.errorMessage).toContain('Every feed failed: Test Feed');
    });
  });

  describe('writing and publishing', () => {
    beforeEach(async () => {
      await agent.runIngestion('manual');
      await prisma.agentRun.deleteMany();
    });

    it('writes one article per run by default and leaves the rest queued', async () => {
      const result = await agent.runEnhancement('manual');

      expect(result).toMatchObject({ claimed: 1, published: 1, rejected: 0, failed: 0 });
      expect(await articleStatuses()).toEqual(['published', 'draft', 'draft']);
      expect(deps.writeArticle).toHaveBeenCalledTimes(1);
      expect(deps.drawCover).toHaveBeenCalledTimes(1);
    });

    it('publishes the media post and links it to the source article', async () => {
      await agent.runEnhancement('manual');

      const post = await prisma.mediaPost.findFirstOrThrow();
      const article = await prisma.n8nArticle.findFirstOrThrow({ where: { status: 'published' } });
      expect(post).toMatchObject({
        slug: 'mpesa-open-api',
        status: 'PUBLISHED',
        cover_image: 'https://cdn.test/mpesa-open-api.png',
        ai_generated: true,
        ai_provider: 'openai',
        n8nArticleId: article.id,
      });
      expect(article).toMatchObject({ slug: 'mpesa-open-api', processing_error: null });
    });

    it('takes the oldest queued article first', async () => {
      await agent.runEnhancement('manual');

      const oldest = await prisma.n8nArticle.findFirstOrThrow({ orderBy: { id: 'asc' } });
      expect(oldest.status).toBe('published');
    });

    it('skips a rejected article, keeps the reason and spends nothing on an image', async () => {
      deps.writeArticle.mockResolvedValue(rejectedReply());

      const result = await agent.runEnhancement('manual');

      expect(result).toMatchObject({ claimed: 1, published: 0, rejected: 1, failed: 0 });
      const article = await prisma.n8nArticle.findFirstOrThrow({ where: { status: 'skipped' } });
      expect(article.processing_error).toBe(
        'Rejected by the AI editor (score 0.21): No African business angle'
      );
      expect(deps.drawCover).not.toHaveBeenCalled();
      expect(await prisma.mediaPost.count()).toBe(0);
    });

    it('records why an article was rejected on the run, which still succeeds', async () => {
      deps.writeArticle.mockResolvedValue(rejectedReply());

      await agent.runEnhancement('manual');

      const [run] = await newsRuns();
      expect(run.status).toBe('succeeded');
      expect(run.steps.map(step => step.key)).toEqual(['run', expect.stringMatching(/^article-/)]);
      expect(run.steps[0].detail).toBe('0 published · 1 rejected · 0 failed');
      expect(run.steps[1]).toMatchObject({
        label: 'Kenya opens M-Pesa API',
        status: 'skipped',
        detail: 'Rejected · score 0.21 — No African business angle',
      });
    });

    it('explains a rejection that came with no reason from the model', async () => {
      deps.writeArticle.mockResolvedValue(rejectedReply(null));

      await agent.runEnhancement('manual');

      const [run] = await newsRuns();
      expect(run.steps[1].detail).toBe(
        'Rejected · score 0.21 — the editor chose not to publish it'
      );
    });

    it('explains a rejection that came from the score alone', async () => {
      deps.writeArticle.mockResolvedValue({ ...goodReply(), score: 0.4 });

      await agent.runEnhancement('manual');

      const [run] = await newsRuns();
      expect(run.steps[1].detail).toBe(
        'Rejected · score 0.40 — score 0.40 is below the 0.6 minimum'
      );
    });

    it('fails the run, with the reason, when the only article fails', async () => {
      deps.writeArticle.mockRejectedValue(new Error('OpenAI rate limit'));

      const result = await agent.runEnhancement('manual');

      expect(result).toMatchObject({ claimed: 1, published: 0, failed: 1 });
      const article = await prisma.n8nArticle.findFirstOrThrow({ where: { status: 'failed' } });
      expect(article.processing_error).toBe('OpenAI rate limit');

      const [run] = await newsRuns();
      expect(run.status).toBe('failed');
      expect(run.errorMessage).toBe('All 1 article failed to publish: OpenAI rate limit');
      expect(run.steps[1]).toMatchObject({
        status: 'failed',
        errorMessage: 'Failed — OpenAI rate limit',
      });
    });

    it('fails an article when its cover cannot be stored, publishing nothing', async () => {
      deps.storeCover.mockRejectedValueOnce(new Error('assets service returned 500'));

      const result = await agent.runEnhancement('manual');

      expect(result.failed).toBe(1);
      expect(await prisma.mediaPost.count()).toBe(0);
      const article = await prisma.n8nArticle.findFirstOrThrow({ where: { status: 'failed' } });
      expect(article.processing_error).toBe('assets service returned 500');
    });

    it('does not record a run when nothing was waiting', async () => {
      await prisma.n8nArticle.deleteMany();
      await prisma.agentRun.deleteMany();

      await agent.runEnhancement('schedule');

      expect(await newsRuns()).toHaveLength(0);
    });

    it('gives a second article with the same slug its own', async () => {
      deps.writeArticle.mockResolvedValue(goodReply('same-slug'));

      await agent.runEnhancement('manual');
      await agent.runEnhancement('manual');

      const slugs = (await prisma.mediaPost.findMany({ orderBy: { created_at: 'asc' } })).map(
        post => post.slug
      );
      expect(slugs).toHaveLength(2);
      expect(slugs[0]).toBe('same-slug');
      expect(slugs[1]).toMatch(/^same-slug-\d+$/);
    });

    it('keeps going when one article in a batch fails, and records each outcome', async () => {
      await prisma.agentSetting.create({ data: { agentKey: 'news', settings: { batchSize: 2 } } });
      deps.writeArticle
        .mockRejectedValueOnce(new Error('OpenAI timeout'))
        .mockResolvedValueOnce(goodReply('second-one'));

      const result = await agent.runEnhancement('manual');

      expect(result).toMatchObject({ claimed: 2, published: 1, failed: 1 });
      const [run] = await newsRuns();
      expect(run.status).toBe('succeeded');
      expect(run.steps.slice(1).map(step => step.status)).toEqual(['failed', 'succeeded']);
      expect(await prisma.mediaPost.count()).toBe(1);
    });

    it('refuses a second manual trigger while one is still running', async () => {
      let release: () => void = () => undefined;
      deps.writeArticle.mockImplementationOnce(
        () => new Promise(resolve => (release = () => resolve(goodReply())))
      );

      expect(agent.trigger('enhance')).toBe(true);
      expect(agent.trigger('enhance')).toBe(false);

      await vi.waitFor(() => expect(deps.writeArticle).toHaveBeenCalled());
      release();
      await vi.waitFor(() => expect(agent.status().enhance.running).toBe(false));

      expect(await newsRuns()).toHaveLength(1);
    });

    it('never processes one article twice when two runs overlap', async () => {
      const [a, b] = await Promise.all([enhancement.run(), enhancement.run()]);

      expect(a.claimed + b.claimed).toBeGreaterThanOrEqual(1);
      expect(a.claimed + b.claimed).toBeLessThanOrEqual(2);
      const processed = deps.writeArticle.mock.calls.map(call => call[0].articleId.toString());
      expect(new Set(processed).size).toBe(processed.length);
      expect((await articleStatuses()).filter(status => status === 'processing')).toHaveLength(0);
    });

    it('fails an article stuck in processing, counts it recovered, can requeue it', async () => {
      await prisma.n8nArticle.deleteMany();
      const stuck = await prisma.n8nArticle.create({
        data: { guid: 'stuck-1', source_url: 'https://example.africa/stuck', status: 'processing' },
      });
      await prisma.$executeRaw`
        UPDATE n8n_articles SET updated_at = now() - interval '2 hours' WHERE id = ${stuck.id}
      `;

      const result = await agent.runEnhancement('schedule');

      expect(result).toMatchObject({ claimed: 0, recovered: 1 });
      const recovered = await prisma.n8nArticle.findUniqueOrThrow({ where: { id: stuck.id } });
      expect(recovered.status).toBe('failed');
      expect(recovered.processing_error).toContain('stopped before it finished');

      const response = await app.inject({
        method: 'POST',
        url: `/news-desk/articles/${stuck.id}/requeue`,
        headers: auth,
      });
      expect(response.statusCode).toBe(200);
      expect((await prisma.n8nArticle.findUniqueOrThrow({ where: { id: stuck.id } })).status).toBe(
        'draft'
      );
    });

    it('does not touch a recently claimed article when recovering orphans', async () => {
      await prisma.n8nArticle.deleteMany();
      await prisma.n8nArticle.create({
        data: { guid: 'fresh-1', source_url: 'https://example.africa/fresh', status: 'processing' },
      });

      await agent.runEnhancement('schedule');

      expect(await articleStatuses()).toEqual(['processing']);
    });
  });

  describe('articles per run, set from the news desk', () => {
    beforeEach(async () => {
      await agent.runIngestion('manual');
      await prisma.agentRun.deleteMany();
    });

    it('starts at one and offers one or two', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/news-desk/summary',
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const { agent: status, byStatus } = response.json().data;
      expect(status).toMatchObject({ batchSize: 1, batchSizeOptions: [1, 2] });
      expect(byStatus).toMatchObject({ draft: 3, published: 0 });
    });

    it('saves two, reports it in the summary and writes two articles on the next run', async () => {
      const saved = await app.inject({
        method: 'PUT',
        url: '/news-desk/settings',
        headers: auth,
        payload: { batchSize: 2 },
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().data).toEqual({ batchSize: 2, batchSizeOptions: [1, 2] });

      const summary = await app.inject({ method: 'GET', url: '/news-desk/summary', headers: auth });
      expect(summary.json().data.agent.batchSize).toBe(2);

      const row = await prisma.agentSetting.findUniqueOrThrow({ where: { agentKey: 'news' } });
      expect(row).toMatchObject({ updatedBy: 'editor-1', settings: { batchSize: 2 } });

      deps.writeArticle
        .mockResolvedValueOnce(goodReply('first'))
        .mockResolvedValueOnce(goodReply('second'));
      const result = await agent.runEnhancement('manual');

      expect(result).toMatchObject({ claimed: 2, published: 2 });
      expect(await articleStatuses()).toEqual(['published', 'published', 'draft']);
    });

    it('can go back to one', async () => {
      await app.inject({
        method: 'PUT',
        url: '/news-desk/settings',
        headers: auth,
        payload: { batchSize: 2 },
      });
      await app.inject({
        method: 'PUT',
        url: '/news-desk/settings',
        headers: auth,
        payload: { batchSize: 1 },
      });

      const result = await agent.runEnhancement('manual');

      expect(result.claimed).toBe(1);
    });

    it.each([0, 3, 5, 1.5, null, 'two'])(
      'refuses %s and keeps the current setting',
      async value => {
        const response = await app.inject({
          method: 'PUT',
          url: '/news-desk/settings',
          headers: auth,
          payload: { batchSize: value },
        });

        expect(response.statusCode).toBe(400);
        expect(await prisma.agentSetting.count()).toBe(0);
      }
    );

    it('ignores fields it does not know instead of storing them', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/news-desk/settings',
        headers: auth,
        payload: { batchSize: 2, other: true },
      });

      expect(response.statusCode).toBe(200);
      const row = await prisma.agentSetting.findUniqueOrThrow({ where: { agentKey: 'news' } });
      expect(row.settings).toEqual({ batchSize: 2 });
    });

    it('refuses a request with no sign-in', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/news-desk/settings',
        payload: { batchSize: 2 },
      });

      expect(response.statusCode).toBe(401);
      expect(await prisma.agentSetting.count()).toBe(0);
    });
  });

  describe('the news desk', () => {
    it('lists articles by status with their latest enhanced version', async () => {
      await agent.runIngestion('manual');
      await agent.runEnhancement('manual');

      const published = await app.inject({
        method: 'GET',
        url: '/news-desk/articles?status=published',
        headers: auth,
      });
      const queued = await app.inject({
        method: 'GET',
        url: '/news-desk/articles?status=draft',
        headers: auth,
      });

      expect(published.json().data.total).toBe(1);
      expect(published.json().data.items[0].mediaPost).toMatchObject({ slug: 'mpesa-open-api' });
      expect(queued.json().data.total).toBe(2);
    });

    it('requeues a rejected article and lets it be written again', async () => {
      await agent.runIngestion('manual');
      deps.writeArticle.mockResolvedValueOnce(rejectedReply());
      await agent.runEnhancement('manual');
      const skipped = await prisma.n8nArticle.findFirstOrThrow({ where: { status: 'skipped' } });

      const response = await app.inject({
        method: 'POST',
        url: `/news-desk/articles/${skipped.id}/requeue`,
        headers: auth,
      });

      expect(response.statusCode).toBe(200);
      const requeued = await prisma.n8nArticle.findUniqueOrThrow({ where: { id: skipped.id } });
      expect(requeued).toMatchObject({ status: 'draft', processing_error: null });
    });

    it('will not requeue a published article', async () => {
      await agent.runIngestion('manual');
      await agent.runEnhancement('manual');
      const published = await prisma.n8nArticle.findFirstOrThrow({
        where: { status: 'published' },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/news-desk/articles/${published.id}/requeue`,
        headers: auth,
      });

      expect(response.statusCode).toBe(409);
    });

    it('will not feature an article that is not published', async () => {
      await agent.runIngestion('manual');
      const draft = await prisma.n8nArticle.findFirstOrThrow();

      const response = await app.inject({
        method: 'POST',
        url: `/news-desk/articles/${draft.id}/feature`,
        headers: auth,
        payload: { featured: true },
      });

      expect(response.statusCode).toBe(409);
    });
  });

  describe('the social post for a published article', () => {
    const seedUser = async (
      options: {
        id?: string;
        autoPublish?: boolean;
        newsOn?: boolean;
        defaultGroup?: boolean;
        account?: boolean;
        maxPostsPerDay?: number;
      } = {}
    ) => {
      const {
        id = 'user-a',
        autoPublish = true,
        newsOn = true,
        defaultGroup = true,
        account = true,
        maxPostsPerDay = 3,
      } = options;
      await prisma.user.create({ data: { id, email: `${id}@afrisinc.test`, password: 'x' } });
      const group = await prisma.accountGroup.create({
        data: { userId: id, name: `Brand ${id}`, slug: `brand-${id}`, isDefault: true },
      });
      if (account) {
        const page = await prisma.socialMediaAccount.create({
          data: { userId: id, platform: 'instagram', pageId: `page-${id}`, pageName: 'IG' },
        });
        await prisma.accountGroupMember.create({ data: { groupId: group.id, accountId: page.id } });
      }
      await prisma.automationPolicy.create({
        data: {
          userId: id,
          mode: 'autopilot',
          autoPublish,
          maxPostsPerDay,
          defaultGroupId: defaultGroup ? group.id : null,
          agents: { news: newsOn },
        },
      });
      return group;
    };

    beforeEach(async () => {
      await agent.runIngestion('manual');
      await prisma.agentRun.deleteMany();
    });

    it('uses the very cover published on the website as its background', async () => {
      await seedUser();

      await agent.runEnhancement('manual');

      const post = await prisma.mediaPost.findFirstOrThrow();
      expect(postAgent.createFromBrief).toHaveBeenCalledTimes(1);
      expect(postAgent.createFromBrief.mock.calls[0][0]).toMatchObject({
        topic: post.title,
        format: 'single',
        slideCount: 1,
        photoUrl: post.cover_image,
        link: 'https://afrisinc.com/media/articles/mpesa-open-api',
        userId: 'user-a',
        news: {
          headline: post.title,
          summary: 'One standard for the region.',
          category: 'fintech',
          source: 'Test Feed',
          articleUrl: 'https://afrisinc.com/media/articles/mpesa-open-api',
          tags: ['fintech'],
        },
      });
      expect(deps.drawCover).toHaveBeenCalledTimes(1);
    });

    it('is tracked as its own post agent run and on the news run', async () => {
      await seedUser();

      await agent.runEnhancement('manual');

      const postRun = await prisma.agentRun.findFirstOrThrow({ where: { agent: 'post-agent' } });
      expect(postRun).toMatchObject({
        userId: 'user-a',
        status: 'succeeded',
        trigger: 'autopilot',
        topic: "M-Pesa's open API could reshape banking",
      });
      const newsRun = (await newsRuns())[0];
      expect(newsRun.steps[1].detail).toBe('Published · score 0.80 · 1 social post drafted');
    });

    it('approves the post when the user has auto-publish on, and holds it when off', async () => {
      await seedUser({ id: 'auto', autoPublish: true });
      await seedUser({ id: 'manual', autoPublish: false });

      await agent.runEnhancement('manual');

      expect(postAgent.createFromBrief).toHaveBeenCalledTimes(2);
      expect(postAgent.approve).toHaveBeenCalledTimes(1);
    });

    it('says so on the run when nobody is set up to receive a post', async () => {
      await agent.runEnhancement('manual');

      expect(postAgent.createFromBrief).not.toHaveBeenCalled();
      const [run] = await newsRuns();
      expect(run.steps[1].detail).toBe(
        'Published · score 0.80 · no social post (no user has the news agent on under autopilot)'
      );
    });

    it('skips users with the agent off, no brand, no accounts or at their limit', async () => {
      await seedUser({ id: 'off', newsOn: false });
      await seedUser({ id: 'nobrand', defaultGroup: false });
      await seedUser({ id: 'noaccounts', account: false });
      await seedUser({ id: 'limit', maxPostsPerDay: 1 });
      await prisma.agentRun.create({
        data: { userId: 'limit', agent: 'post-agent', trigger: 'manual', status: 'succeeded' },
      });
      await prisma.automationPolicy.update({
        where: { userId: 'nobrand' },
        data: { defaultGroupId: null },
      });
      await prisma.accountGroup.updateMany({
        where: { userId: 'nobrand' },
        data: { isDefault: false },
      });

      await agent.runEnhancement('manual');

      expect(postAgent.createFromBrief).not.toHaveBeenCalled();
      const [run] = await newsRuns();
      const detail = run.steps.find(step => step.key !== 'run')?.detail ?? '';
      expect(detail).toContain('social skipped:');
      expect(detail).toContain('no default brand is set');
      expect(detail).toContain('no switched-on accounts in this brand');
      expect(detail).toContain('daily post limit reached');
    });

    it('does not post a second time for the same story and brand', async () => {
      await seedUser();
      const first = (await prisma.n8nArticle.findFirstOrThrow({ orderBy: { id: 'asc' } })).id;

      await agent.runEnhancement('manual');
      await prisma.n8nArticle.update({ where: { id: first }, data: { status: 'draft' } });
      await prisma.mediaPost.deleteMany();
      deps.writeArticle.mockResolvedValue(goodReply('same-story-again'));
      postAgent.createFromBrief.mockClear();

      await agent.runEnhancement('manual');

      expect(postAgent.createFromBrief).not.toHaveBeenCalled();
    });

    it('keeps the article published and the run succeeded when the post fails', async () => {
      await seedUser();
      postAgent.createFromBrief.mockRejectedValue(new Error('render service unreachable'));

      const result = await agent.runEnhancement('manual');

      expect(result).toMatchObject({ published: 1, failed: 0 });
      expect(await articleStatuses()).toEqual(['published', 'draft', 'draft']);
      const [run] = await newsRuns();
      expect(run.status).toBe('succeeded');
      expect(run.steps[1].detail).toContain('social post failed: render service unreachable');
      const postRun = await prisma.agentRun.findFirstOrThrow({ where: { agent: 'post-agent' } });
      expect(postRun).toMatchObject({
        status: 'failed',
        errorMessage: 'render service unreachable',
      });
    });

    it('never drafts a post for an article the editor rejected', async () => {
      await seedUser();
      deps.writeArticle.mockResolvedValue(rejectedReply());

      await agent.runEnhancement('manual');

      expect(postAgent.createFromBrief).not.toHaveBeenCalled();
    });
  });

  describe('the OpenAI key saved in AI providers', () => {
    it('is stored encrypted and is the key the news agent resolves', async () => {
      await aiProviderConfigService.save(
        'openai',
        'text',
        { apiKey: 'sk-saved-in-the-database-12345', model: 'gpt-4.1' },
        'admin-1'
      );

      const [raw] = await prisma.$queryRaw<
        { apiKeyEnc: string }[]
      >`SELECT "apiKeyEnc" FROM ai_provider_configs`;
      expect(raw.apiKeyEnc).not.toContain('sk-saved-in-the-database');

      const resolved = await resolveChatGptConfig();
      expect(resolved.credentials.apiKey).toBe('sk-saved-in-the-database-12345');
      expect(resolved.model).toBe('gpt-4.1');
    });

    it('lets the news run start on that key', async () => {
      await aiProviderConfigService.save(
        'openai',
        'text',
        { apiKey: 'sk-saved-in-db-12345' },
        'admin-1'
      );
      await agent.runIngestion('manual');

      const result = await agent.runEnhancement('manual');

      expect(result.published).toBe(1);
    });

    it('is ignored once switched off, so the server key is used', async () => {
      await aiProviderConfigService.save(
        'openai',
        'text',
        { apiKey: 'sk-saved-in-db-12345' },
        'admin-1'
      );
      await aiProviderConfigService.save('openai', 'text', { isActive: false }, 'admin-1');

      expect(await aiProviderConfigService.resolve('openai', 'text')).toBeNull();
    });
  });
});
