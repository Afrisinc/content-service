import { buildRecommendations, comparablePosts } from '@/helpers/analyticsInsights.helper';
import { scorerFor } from '@/helpers/postScore.helper';
import { buildWeeklyPlan, planConfidence, rankTopics } from '@/helpers/postingPlan.helper';
import { accountGroupRepository } from '@/repositories/accountGroup.repository';
import { analyticsRepository } from '@/repositories/analytics.repository';
import { NotFoundError } from '@/utils/http-error';

const DEFAULT_SLOT_WEEKDAYS = '2,5';
const DEFAULT_SLOT_HOUR = 9;

export type PostingPlan = Awaited<ReturnType<PostingPlanService['build']>>;

export class PostingPlanService {
  async build(userId: string, from: Date, to: Date, groupId?: string) {
    const brand = await analyticsRepository.planningBrand(userId, groupId);
    if (groupId && !brand) {
      throw new NotFoundError('brand not found');
    }

    const accounts = brand ? await accountGroupRepository.findActiveTargets(brand.id) : undefined;
    const [posts, connected] = await Promise.all([
      analyticsRepository.publishedPosts(userId, from, to, accounts),
      accounts
        ? [...new Set(accounts.map(account => account.platform))]
        : analyticsRepository.connectedPlatforms(userId),
    ]);

    const timeZone = brand?.timezone || 'UTC';
    const evidence = comparablePosts(posts);
    const confidence = planConfidence(evidence);

    const cadence = {
      slotWeekdays: brand?.slotWeekdays ?? DEFAULT_SLOT_WEEKDAYS,
      slotHour: brand?.slotHour ?? DEFAULT_SLOT_HOUR,
      timezone: timeZone,
      postsPerRun: brand?.postsPerRun ?? 1,
      defaultFormat: brand?.defaultFormat ?? 'post',
      topics: brand?.topics ?? [],
    };

    const slots = brand ? buildWeeklyPlan(posts, connected, cadence, new Date(), evidence) : [];

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      timeZone,
      confidence,
      brand: brand ? { id: brand.id, name: brand.name } : null,
      brandProfile: brand
        ? {
            description: brand.description,
            serviceLine: brand.serviceLine,
            audience: brand.audience,
            topics: brand.topics,
          }
        : null,
      topics: rankTopics(evidence, 5),
      recommendations: buildRecommendations(evidence, connected, timeZone, {
        slotHour: brand ? cadence.slotHour : undefined,
        volume: posts,
      }),
      slots,
      postsAnalysed: evidence.length,
      postsPublished: posts.length,
      metric: scorerFor(evidence).mode,
    };
  }
}

export const postingPlanService = new PostingPlanService();
