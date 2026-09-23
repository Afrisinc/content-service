import axios from 'axios';
import type { Prisma } from '@prisma/client';
import { env } from '@/config/env';
import {
  parseFeed,
  resolveNewsSources,
  type FeedItem,
  type NewsSource,
} from '@/helpers/rssFeed.helper';
import { n8nArticleRepository } from '@/repositories/n8nArticle.repository';
import { logger } from '@/utils/logger';

export type FeedFetcher = (url: string) => Promise<string>;

export interface IngestionResult {
  startedAt: string;
  finishedAt: string;
  sources: number;
  fetched: number;
  created: number;
  duplicates: number;
  failedSources: { name: string; error: string }[];
}

const FEED_CONCURRENCY = 4;
const MAX_FEED_BYTES = 5 * 1024 * 1024;

const fetchFeedOverHttp: FeedFetcher = async url => {
  const response = await axios.get<string>(url, {
    timeout: env.NEWS_FEED_TIMEOUT_MS,
    responseType: 'text',
    maxContentLength: MAX_FEED_BYTES,
    headers: {
      'User-Agent': 'AfrisincMediaBot/1.0 (+https://afrisinc.com)',
      Accept:
        'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
    },
  });
  return response.data;
};

function toRow(item: FeedItem, source: NewsSource): Prisma.N8nArticleCreateManyInput {
  return {
    guid: item.guid,
    source_url: item.link,
    source_headline: item.title,
    source_summary: item.summary,
    image_url: item.imageUrl,
    pub_date: item.publishedAt,
    category: source.category,
    creator: source.name,
    status: 'draft',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class NewsIngestionService {
  constructor(private readonly fetchFeed: FeedFetcher = fetchFeedOverHttp) {}

  /** One pass over every configured feed. A failing feed is reported, never fatal. */
  async run(): Promise<IngestionResult> {
    const startedAt = new Date();
    const sources = resolveNewsSources(env.NEWS_RSS_SOURCES);
    const failedSources: IngestionResult['failedSources'] = [];
    const rowsByGuid = new Map<string, Prisma.N8nArticleCreateManyInput>();
    let fetched = 0;

    for (let index = 0; index < sources.length; index += FEED_CONCURRENCY) {
      const batch = sources.slice(index, index + FEED_CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async source => ({
          source,
          items: parseFeed(await this.fetchFeed(source.url), env.NEWS_FEED_ITEM_LIMIT),
        }))
      );

      results.forEach((result, position) => {
        if (result.status === 'rejected') {
          failedSources.push({ name: batch[position].name, error: errorMessage(result.reason) });
          return;
        }
        fetched += result.value.items.length;
        for (const item of result.value.items) {
          if (!rowsByGuid.has(item.guid)) {
            rowsByGuid.set(item.guid, toRow(item, result.value.source));
          }
        }
      });
    }

    const existing = await n8nArticleRepository.findExistingGuids([...rowsByGuid.keys()]);
    const fresh = [...rowsByGuid.values()].filter(row => !existing.has(row.guid));
    const created = await n8nArticleRepository.createIngested(fresh);

    const result: IngestionResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      sources: sources.length,
      fetched,
      created,
      duplicates: fetched - created,
      failedSources,
    };

    if (failedSources.length > 0) {
      logger.warn({ failedSources }, 'news_ingestion.sources_failed');
    }
    logger.info(
      { sources: result.sources, fetched, created, failed: failedSources.length },
      'news_ingestion.completed'
    );
    return result;
  }
}

export const newsIngestionService = new NewsIngestionService();
