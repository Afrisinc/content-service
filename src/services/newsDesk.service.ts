import { n8nArticleRepository } from '@/repositories/n8nArticle.repository';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import {
  NEWS_ARTICLE_STATUSES,
  STUCK_AFTER_MINUTES,
  type NewsArticleStatus,
} from '@/types/newsDesk.types';
import { newsAgentService, type NewsAgentStage } from '@/services/newsAgent.service';

export { STUCK_AFTER_MINUTES };

const REQUEUEABLE: NewsArticleStatus[] = ['failed', 'skipped'];
const SKIPPABLE: NewsArticleStatus[] = ['draft', 'failed'];

export interface NewsDeskListQuery {
  status?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 100;

function stuckCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - STUCK_AFTER_MINUTES * 60 * 1000);
}

function isStuck(article: { status: string; updated_at: Date }, cutoff: Date): boolean {
  return article.status === 'processing' && article.updated_at < cutoff;
}

function parseArticleId(id: string): bigint {
  if (!/^\d+$/.test(id)) {
    throw new BadRequestError('article id must be numeric');
  }
  return BigInt(id);
}

export class NewsDeskService {
  async list(query: NewsDeskListQuery) {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const cutoff = stuckCutoff();

    const { articles, total } = await n8nArticleRepository.listForDesk({
      status: query.status,
      category: query.category?.trim() || undefined,
      search: query.search?.trim() || undefined,
      page,
      limit,
    });

    const items = articles.map(({ mediaPosts, _count, ...article }) => ({
      ...article,
      mediaPost: mediaPosts[0] ?? null,
      generatedPostCount: _count.generatedPosts,
      stuck: isStuck(article, cutoff),
    }));

    return { items, total, page, limit };
  }

  async summary() {
    const [groups, stuck, categories, lastIngestedAt] = await Promise.all([
      n8nArticleRepository.deskStatusTotals(),
      n8nArticleRepository.countStuck(stuckCutoff()),
      n8nArticleRepository.getCategories(),
      n8nArticleRepository.latestIngestedAt(),
    ]);

    const byStatus = Object.fromEntries(NEWS_ARTICLE_STATUSES.map(status => [status, 0])) as Record<
      NewsArticleStatus,
      number
    >;
    let total = 0;
    let views = 0;
    let reads = 0;

    for (const group of groups) {
      total += group._count._all;
      views += group._sum.viewCount ?? 0;
      reads += group._sum.readCount ?? 0;
      if (group.status in byStatus) {
        byStatus[group.status as NewsArticleStatus] = group._count._all;
      }
    }

    return {
      total,
      byStatus,
      stuck,
      views,
      reads,
      categories,
      stuckAfterMinutes: STUCK_AFTER_MINUTES,
      lastIngestedAt,
      agent: newsAgentService.status(),
    };
  }

  async get(id: string) {
    const article = await n8nArticleRepository.findDeskDetail(parseArticleId(id));
    if (!article) {
      throw new NotFoundError('article not found');
    }

    const { mediaPosts, ...rest } = article;
    return { ...rest, mediaPost: mediaPosts[0] ?? null, stuck: isStuck(article, stuckCutoff()) };
  }

  /** Sends the article back to `draft`, where WF2's next run picks it up again. */
  async requeue(id: string) {
    const article = await this.require(id);
    const status = article.status as NewsArticleStatus;

    if (!REQUEUEABLE.includes(status) && !isStuck(article, stuckCutoff())) {
      const reason =
        status === 'processing'
          ? `it is still being enhanced — try again after ${STUCK_AFTER_MINUTES} minutes`
          : `a ${status} article cannot be requeued`;
      throw new ConflictError(reason);
    }

    const updated = await n8nArticleRepository.update(article.id, {
      status: 'draft',
      processing_error: null,
    });
    logger.info({ articleId: article.id.toString(), from: status }, 'news_desk.article_requeued');
    return updated;
  }

  async skip(id: string) {
    const article = await this.require(id);
    const status = article.status as NewsArticleStatus;

    if (!SKIPPABLE.includes(status)) {
      throw new ConflictError(`a ${status} article cannot be skipped`);
    }

    const updated = await n8nArticleRepository.update(article.id, { status: 'skipped' });
    logger.info({ articleId: article.id.toString(), from: status }, 'news_desk.article_skipped');
    return updated;
  }

  async setFeatured(id: string, featured: boolean) {
    const article = await this.require(id);

    if (featured && article.status !== 'published') {
      throw new ConflictError('only a published article can be featured');
    }

    return n8nArticleRepository.update(article.id, { is_featured: featured });
  }

  /** Starts a pipeline stage in the background, as the cron would. */
  triggerStage(stage: NewsAgentStage) {
    if (!newsAgentService.trigger(stage)) {
      throw new ConflictError(
        stage === 'ingest'
          ? 'feeds are already being fetched'
          : 'articles are already being enhanced'
      );
    }
    return { stage, started: true };
  }

  private async require(id: string) {
    const article = await n8nArticleRepository.findById(parseArticleId(id));
    if (!article) {
      throw new NotFoundError('article not found');
    }
    return article;
  }
}

export const newsDeskService = new NewsDeskService();
