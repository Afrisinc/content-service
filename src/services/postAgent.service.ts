import { getSlideAssetPublisher, SlideAssetPublisher } from '@/adapters/assets/slide.assets';
import { getRenderClient, RenderClient } from '@/adapters/render/render.client';
import { env } from '@/config/env';
import {
  SocialMediaAccountRepository,
  socialMediaAccountRepository,
} from '@/repositories/socialMediaAccount.repository';
import { buildPostSlug, buildPostSpecFromCopy, buildFullCaption } from '@/helpers/postSpec.helper';
import {
  CANCELLED_POST_STATUS,
  nextFreeSlot,
  parseWeekdays,
  PENDING_POST_STATUS,
  REVIEW_POST_STATUS,
} from '@/helpers/postingSlot.helper';
import { PostDraftRepository, postDraftRepository } from '@/repositories/postDraft.repository';
import { socialMediaPostRepository } from '@/repositories/socialMediaPost.repository';
import { ArtDirectionService, artDirectionService } from '@/services/artDirection.service';
import { PostCopyService, postCopyService } from '@/services/postCopy.service';
import {
  PostBriefPayload,
  PostFormatName,
  PostSpec,
  RenderResult,
  SchedulePostPayload,
} from '@/types/post.types';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { PostDraft, PostDraftStatus, PostFormat, Prisma } from '@prisma/client';

export class PostAgentService {
  constructor(
    private readonly drafts: PostDraftRepository = postDraftRepository,
    private readonly copyService: PostCopyService = postCopyService,
    private readonly artDirection: ArtDirectionService = artDirectionService,
    private readonly render: RenderClient = getRenderClient(),
    private readonly slideAssets: SlideAssetPublisher = getSlideAssetPublisher(),
    private readonly accounts: SocialMediaAccountRepository = socialMediaAccountRepository
  ) {}

  async createFromBrief(brief: PostBriefPayload): Promise<PostDraft> {
    if (!brief.userId) {
      throw new BadRequestError('a brief needs an owner');
    }

    const format: PostFormatName = brief.format ?? 'post';
    const { copy, attempts } = await this.copyService.generate({ ...brief, format });
    const { photosByIndex, assetIds } = await this.artDirection.assignPhotos(copy);

    const slug = buildPostSlug(brief.topic);
    const spec = buildPostSpecFromCopy(slug, copy, photosByIndex, format);

    const draft = await this.drafts.create({
      userId: brief.userId,
      topic: brief.topic,
      format,
      serviceLine: brief.serviceLine,
      offer: brief.offer,
      audience: brief.audience,
      spec: spec as unknown as Prisma.InputJsonValue,
      caption: buildFullCaption(copy),
      hashtags: copy.hashtags,
      claims: copy.claims,
      aiProvider: 'anthropic',
      generationTries: attempts,
    });

    try {
      const result = await this.renderAndStore(draft.id, spec);
      await this.artDirection.recordUse(assetIds);

      // Queuing is a convenience, not part of the artwork. A scheduling failure
      // must not throw away a post that rendered and passed the audit.
      const queued = await this.queueForReview(draft.id, brief).catch(err => {
        logger.error(
          { draftId: draft.id, error: err instanceof Error ? err.message : String(err) },
          'Post rendered but could not be queued for review'
        );
        return undefined;
      });

      logger.info(
        {
          draftId: draft.id,
          slug,
          passed: result.passed,
          concept: copy.concept,
          scheduledAt: queued?.toISOString(),
        },
        'Post drafted'
      );
      return (await this.drafts.findById(draft.id)) as PostDraft;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.drafts.markFailed(draft.id, message);
      throw err;
    }
  }

  async rerender(id: string): Promise<PostDraft> {
    const draft = await this.requireDraft(id);
    this.assertMutable(draft);

    const spec = draft.spec as unknown as PostSpec;
    await this.renderAndStore(draft.id, spec);
    return (await this.drafts.findById(id)) as PostDraft;
  }

  async approve(id: string, approvedBy: string): Promise<PostDraft> {
    const draft = await this.requireDraft(id);

    if (draft.status === PostDraftStatus.scheduled) {
      throw new ConflictError('this post is already scheduled');
    }
    if (!draft.auditPassed) {
      throw new ConflictError('the craft audit has not passed — re-render before approving');
    }
    if (!draft.slideUrls.length) {
      throw new ConflictError('nothing has been rendered to approve');
    }

    const approved = await this.drafts.approve(id, approvedBy);

    if (draft.socialPostIds.length) {
      await socialMediaPostRepository.setStatusForPosts(draft.socialPostIds, PENDING_POST_STATUS);
      return this.drafts.markScheduled(id, draft.socialPostIds, draft.scheduledAt ?? new Date());
    }

    // No posts created yet — create them with pending status so cron can pick them up
    const target = await this.resolveTarget({}, draft.userId);
    if (!target.pageId) {
      logger.warn({ draftId: id, userId: draft.userId }, 'Cannot auto-schedule: no page ID');
      return approved;
    }

    const scheduledAt = await this.resolveSlot();
    const postIds = await this.createPosts(draft, target, scheduledAt, PENDING_POST_STATUS);
    await this.drafts.markScheduled(id, postIds, scheduledAt);

    logger.info(
      { draftId: id, postIds, scheduledAt },
      'Approval created and scheduled social posts'
    );
    return (await this.drafts.findById(id)) as PostDraft;
  }

  async reject(id: string, reason: string): Promise<PostDraft> {
    const draft = await this.requireDraft(id);

    // A rejected draft must not leave a post sitting in the queue.
    if (draft.socialPostIds.length) {
      await socialMediaPostRepository.setStatusForPosts(draft.socialPostIds, CANCELLED_POST_STATUS);
    }

    return this.drafts.reject(id, reason);
  }

  /**
   * Move an existing draft to a different slot, or queue one that was never
   * auto-queued because no default target was configured.
   */
  async schedule(id: string, payload: SchedulePostPayload): Promise<PostDraft> {
    const draft = await this.requireDraft(id);

    if (draft.status === PostDraftStatus.rejected || draft.status === PostDraftStatus.failed) {
      throw new ConflictError('a rejected or failed draft cannot be scheduled');
    }
    if (!draft.slideUrls.length) {
      throw new ConflictError('nothing has been rendered to schedule');
    }

    const scheduledAt = payload.scheduledAt
      ? new Date(payload.scheduledAt)
      : await this.resolveSlot();

    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestError('scheduledAt must be a future timestamp');
    }

    if (draft.socialPostIds.length) {
      await socialMediaPostRepository.reschedulePosts(draft.socialPostIds, scheduledAt);
      return this.drafts.markQueued(id, draft.socialPostIds, scheduledAt);
    }

    const target = await this.resolveTarget(payload, draft.userId);
    const postIds = await this.createPosts(draft, target, scheduledAt, this.statusFor(draft));
    return this.drafts.markQueued(id, postIds, scheduledAt);
  }

  async get(id: string): Promise<PostDraft> {
    return this.requireDraft(id);
  }

  async list(params: {
    userId?: string;
    status?: PostDraftStatus;
    format?: string;
    page?: number;
    limit?: number;
  }) {
    return this.drafts.list(params);
  }

  /**
   * A feed post is one row carrying every frame. A story is not — each frame is
   * published on its own, so a three-frame story becomes three scheduled posts.
   */
  private async createPosts(
    draft: PostDraft,
    target: { platform: string; pageId: string },
    scheduledAt: Date,
    status: string
  ): Promise<string[]> {
    const common = {
      userId: draft.userId,
      platform: target.platform,
      pageId: target.pageId,
      scheduledAt,
      status,
      aiGenerated: true,
      aiProvider: draft.aiProvider ?? undefined,
      aiModel: draft.aiModel ?? undefined,
    };

    // A story has neither a caption nor hashtags on the platform, so it carries
    // neither here — a tags array on a story row is dead weight that misleads.
    if (draft.format === 'story') {
      const posts = await Promise.all(
        draft.slideUrls.map(url =>
          socialMediaPostRepository.createPost({
            ...common,
            postFormat: PostFormat.story,
            mediaType: 'image',
            mediaUrls: [url],
          })
        )
      );
      return posts.map(post => post.id);
    }

    const post = await socialMediaPostRepository.createPost({
      ...common,
      message: draft.caption ?? undefined,
      tags: draft.hashtags,
      postFormat: PostFormat.feed,
      mediaType: draft.slideUrls.length > 1 ? 'carousel' : 'image',
      mediaUrls: draft.slideUrls,
    });
    return [post.id];
  }

  /**
   * Queue the draft into its posting slot straight away, held in review. The cron
   * only ever picks up `pending`, so nothing can publish before someone approves.
   */
  private async queueForReview(id: string, brief: PostBriefPayload): Promise<Date | undefined> {
    if (!env.POST_AUTO_SCHEDULE) {
      return undefined;
    }

    const draft = (await this.drafts.findById(id)) as PostDraft;
    const target = await this.resolveTarget({}, draft.userId);
    if (!target.pageId) {
      logger.warn(
        { draftId: id, userId: draft.userId },
        'No page ID found in env or integrations — draft rendered but not queued for review'
      );
      return undefined;
    }

    if (!draft.slideUrls.length) {
      return undefined;
    }

    const scheduledAt = await this.resolveSlot();
    const postIds = await this.createPosts(draft, target, scheduledAt, REVIEW_POST_STATUS);
    await this.drafts.markQueued(id, postIds, scheduledAt);

    logger.info({ draftId: id, scheduledAt, brief: brief.topic }, 'Post queued for review');
    return scheduledAt;
  }

  private statusFor(draft: PostDraft): string {
    return draft.status === PostDraftStatus.approved ? PENDING_POST_STATUS : REVIEW_POST_STATUS;
  }

  private async resolveTarget(
    payload: SchedulePostPayload,
    userId?: string
  ): Promise<{ platform: string; pageId: string }> {
    const platform = payload.platform ?? env.POST_DEFAULT_PLATFORM;
    let pageId = payload.pageId ?? env.POST_DEFAULT_PAGE_ID;

    if (!pageId && userId) {
      const accounts = await this.accounts.findAllByUser(userId);
      const account = accounts.find(a => a.platform === platform);
      if (account) {
        pageId = account.pageId;
      }
    }

    return { platform, pageId };
  }

  private async resolveSlot(): Promise<Date> {
    const taken = await this.drafts.findTakenSlots(new Date());
    return nextFreeSlot(taken, {
      weekdays: parseWeekdays(env.POST_SLOT_WEEKDAYS),
      hour: env.POST_SLOT_HOUR,
    });
  }

  private async renderAndStore(id: string, spec: PostSpec): Promise<RenderResult> {
    const result = await this.render.render(spec);
    const slideUrls = await this.publishSlides(result);

    await this.drafts.markRendered(id, {
      spec: spec as unknown as Prisma.InputJsonValue,
      slideUrls,
      auditReport: result as unknown as Prisma.InputJsonValue,
      auditPassed: result.passed,
    });

    return result;
  }

  /**
   * The render service is internal, so its URLs are useless to Instagram. Copy every
   * frame to the assets service and schedule the public URLs instead.
   */
  private async publishSlides(result: RenderResult): Promise<string[]> {
    const files = await Promise.all(
      result.slides.map(async slide => ({
        filename: slide.filename,
        body: await this.render.fetchSlide(result.slug, slide.filename),
      }))
    );

    return this.slideAssets.publish(result.slug, files);
  }

  private async requireDraft(id: string): Promise<PostDraft> {
    const draft = await this.drafts.findById(id);
    if (!draft) {
      throw new NotFoundError('post draft not found');
    }
    return draft;
  }

  private assertMutable(draft: PostDraft): void {
    if (draft.status === PostDraftStatus.scheduled) {
      throw new ConflictError('a scheduled post cannot be re-rendered');
    }
  }
}

export const postAgentService = new PostAgentService();
