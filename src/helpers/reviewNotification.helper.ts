import { env } from '@/config/env';
import { UserRepository, userRepository } from '@/repositories/user.repository';
import { logger } from '@/utils/logger';
import {
  parseChannels,
  sendNotification,
  type NotificationRequest,
  type NotificationResult,
  type NotificationTarget,
} from '@/utils/notify';
import type { Channel } from '@afrisinc/notify-sdk';

export const POST_REVIEW_TEMPLATE = 'post-review-requested';

export interface ReviewRecipient {
  userId: string;
  email?: string | null;
  name?: string | null;
}

export interface PostReviewNotice {
  draftId: string;
  topic: string;
  format: string;
  slideCount: number;
  postCount: number;
  scheduledAt: Date | null;
}

export function postReviewUrl(draftId: string): string {
  return `${env.DASHBOARD_URL.replace(/\/+$/, '')}/posts/${draftId}`;
}

function addressFor(recipient: ReviewRecipient, channel: Channel): string {
  if (channel === 'in_app') {
    return recipient.userId;
  }
  if (channel === 'email') {
    return recipient.email ?? '';
  }
  return '';
}

export function buildReviewTargets(
  recipient: ReviewRecipient,
  channels: readonly Channel[] = parseChannels(env.NOTIFY_REVIEW_CHANNELS)
): NotificationTarget[] {
  return channels
    .map(channel => ({ channel, to: addressFor(recipient, channel) }))
    .filter(target => Boolean(target.to));
}

export function buildPostReviewNotification(
  recipient: ReviewRecipient,
  notice: PostReviewNotice
): NotificationRequest {
  return {
    targets: buildReviewTargets(recipient),
    template: POST_REVIEW_TEMPLATE,
    priority: 'high',
    dedupeKey: `notify:post-review:${notice.draftId}`,
    dedupeTtlSeconds: env.NOTIFY_DEDUPE_TTL_SECONDS,
    data: {
      name: recipient.name ?? 'there',
      draft_id: notice.draftId,
      topic: notice.topic,
      format: notice.format,
      slide_count: notice.slideCount,
      post_count: notice.postCount,
      scheduled_at: notice.scheduledAt?.toISOString() ?? null,
      review_url: postReviewUrl(notice.draftId),
      action: 'review-and-approve',
    },
  };
}

export async function requestPostReview(
  notice: PostReviewNotice & { userId: string },
  users: UserRepository = userRepository
): Promise<NotificationResult> {
  const user = await users.findById(notice.userId).catch(() => null);

  const result = await sendNotification(
    buildPostReviewNotification(
      { userId: notice.userId, email: user?.email, name: user?.name },
      notice
    )
  );

  logger.info(
    { draftId: notice.draftId, notified: result.sent.length, skipped: result.skipped },
    'Review requested'
  );

  return result;
}
