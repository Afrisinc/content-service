import { MediaPostStatus, type CreateMediaPostPayload } from '@/types/mediaPost.types';

/**
 * What n8n WF2 actually posts. Both versions of the workflow are in use and
 * they disagree on field names, so the ingest accepts either spelling.
 */
export type N8nMediaPostBody = Omit<CreateMediaPostPayload, 'n8nArticleId' | 'status'> & {
  n8nArticleId?: string | number;
  n8n_article_id?: string | number;
  featured_image?: string;
  status?: string;
};

const STATUSES = new Set<string>(Object.values(MediaPostStatus));

function normalizeStatus(status: string | undefined): MediaPostStatus | undefined {
  const upper = status?.trim().toUpperCase();
  return upper && STATUSES.has(upper) ? (upper as MediaPostStatus) : undefined;
}

export function toMediaPostPayload(
  body: N8nMediaPostBody,
  now: Date = new Date()
): CreateMediaPostPayload {
  const {
    n8nArticleId,
    n8n_article_id: snakeArticleId,
    featured_image: featuredImage,
    status: rawStatus,
    ...rest
  } = body;

  const articleId = n8nArticleId ?? snakeArticleId;
  const status = normalizeStatus(rawStatus);

  return {
    ...rest,
    cover_image: rest.cover_image || featuredImage || undefined,
    status,
    published_at: rest.published_at ?? (status === MediaPostStatus.PUBLISHED ? now : undefined),
    n8nArticleId:
      articleId !== undefined && articleId !== null && String(articleId).trim() !== ''
        ? BigInt(articleId)
        : undefined,
    ai_generated: true,
  };
}
