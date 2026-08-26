import { getSlideAssetPublisher, SlideAssetPublisher } from '@/adapters/assets/slide.assets';
import { getRenderClient, RenderClient } from '@/adapters/render/render.client';
import { env } from '@/config/env';
import {
  AccountGroupRepository,
  accountGroupRepository,
} from '@/repositories/accountGroup.repository';
import {
  AutomationPolicyRepository,
  automationPolicyRepository,
} from '@/repositories/automationPolicy.repository';
import { AgentRunRepository, agentRunRepository } from '@/repositories/agentRun.repository';
import { AgentRunTracker, agentRunTracker } from '@/services/agentRunTracker.service';
import {
  AGENT_STEP_KEYS,
  RUN_STATE_KEYS,
  RunStateKey,
  describeSlot,
  pluralise,
  runStateKey,
} from '@/helpers/agentRun.helper';
import { registerRun, releaseRun } from '@/helpers/runCancellation.helper';
import { cacheDelete, cacheGet, cacheSet } from '@/utils/cache';
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
import { UserRepository, userRepository } from '@/repositories/user.repository';
import { requestPostReview } from '@/helpers/reviewNotification.helper';
import { ArtDirectionService, artDirectionService } from '@/services/artDirection.service';
import { PostCopyService, postCopyService } from '@/services/postCopy.service';
import {
  PostBriefPayload,
  PostCopy,
  PostFormatName,
  PostSpec,
  RenderResult,
  SchedulePostPayload,
} from '@/types/post.types';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import {
  AgentRunStatus,
  AutomationMode,
  PostDraft,
  PostDraftStatus,
  PostFormat,
  Prisma,
} from '@prisma/client';

export class PostAgentService {
  constructor(
    private readonly drafts: PostDraftRepository = postDraftRepository,
    private readonly copyService: PostCopyService = postCopyService,
    private readonly artDirection: ArtDirectionService = artDirectionService,
    private readonly render: RenderClient = getRenderClient(),
    private readonly slideAssets: SlideAssetPublisher = getSlideAssetPublisher(),
    private readonly accounts: SocialMediaAccountRepository = socialMediaAccountRepository,
    private readonly groups: AccountGroupRepository = accountGroupRepository,
    private readonly policies: AutomationPolicyRepository = automationPolicyRepository,
    private readonly tracker: AgentRunTracker = agentRunTracker,
    private readonly runs: AgentRunRepository = agentRunRepository,
    private readonly users: UserRepository = userRepository
  ) {}

  async createFromBrief(brief: PostBriefPayload): Promise<PostDraft> {
    if (!brief.userId) {
      throw new BadRequestError('a brief needs an owner');
    }

    const format: PostFormatName = brief.format ?? 'post';

    // The trace is a report on the work, never a gate on it — a run that cannot
    // be recorded still produces the post.
    const userId = brief.userId;
    const runId = await this.tracker.begin({
      userId,
      groupId: brief.groupId,
      agent: 'post-agent',
      trigger: brief.trigger ?? 'manual',
      topic: brief.topic,
      runId: brief.runId,
    });

    await this.rememberState(runId, RUN_STATE_KEYS.brief, { ...brief, format });

    try {
      return await this.draftAndQueue(brief, format, runId, userId);
    } catch (err) {
      await this.tracker.finish(runId, {
        status: AgentRunStatus.failed,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      if (runId) {
        releaseRun(runId);
      }
    }
  }

  private async draftAndQueue(
    brief: PostBriefPayload,
    format: PostFormatName,
    runId: string | null,
    userId: string
  ): Promise<PostDraft> {
    await this.tracker.succeed(runId, AGENT_STEP_KEYS.brief, brief.topic);

    // A resumed run must not pay the copy agent twice — the generated copy is the
    // expensive part, and it is already correct.
    const signal = runId ? registerRun(runId) : undefined;

    const { copy, attempts } = await this.reuseOrRun(
      runId,
      AGENT_STEP_KEYS.copy,
      RUN_STATE_KEYS.copy,
      () => this.copyService.generate({ ...brief, format }, signal),
      generated => {
        const frames = pluralise(generated.copy.slides.length, 'frame');
        return `${frames} · ${pluralise(generated.attempts, 'attempt')}`;
      }
    );

    const { photosByIndex, assetIds } = await this.reuseOrRun(
      runId,
      AGENT_STEP_KEYS.art,
      RUN_STATE_KEYS.art,
      () => this.artDirection.assignPhotos(copy, userId, brief.groupId, brief.assetIds),
      assigned => {
        const photos = pluralise(assigned.assetIds.length, 'photograph');
        return assigned.reused ? `${photos} · ${assigned.reused} reused` : photos;
      }
    );

    const slug = buildPostSlug(brief.topic);
    const spec = buildPostSpecFromCopy(slug, copy, photosByIndex, format);

    const draft = await this.resumeDraft(runId, spec, copy);
    if (draft) {
      return this.renderQueueAndFinish(draft, spec, copy, assetIds, brief, runId, slug);
    }

    const created = await this.drafts.create({
      userId,
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

    return this.renderQueueAndFinish(created, spec, copy, assetIds, brief, runId, slug);
  }

  /**
   * Everything downstream of the draft row: render, audit, publish the frames,
   * queue. Shared by a fresh draft and a resumed one so the two cannot drift.
   */
  private async renderQueueAndFinish(
    draft: PostDraft,
    spec: PostSpec,
    copy: PostCopy,
    assetIds: string[],
    brief: PostBriefPayload,
    runId: string | null,
    slug: string
  ): Promise<PostDraft> {
    try {
      const result = await this.renderAndStore(draft.id, spec, runId);
      await this.artDirection.recordUse(assetIds);

      // Queuing is a convenience, not part of the artwork. A scheduling failure
      // must not throw away a post that rendered and passed the audit.
      const queued = await this.queueForReview(draft.id, brief, runId).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { draftId: draft.id, error: message },
          'Post rendered but could not be queued'
        );
        void this.tracker.fail(runId, AGENT_STEP_KEYS.queue, message);
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

      const finished = (await this.drafts.findById(draft.id)) as PostDraft;
      await this.tracker.finish(runId, {
        status: AgentRunStatus.succeeded,
        draftId: finished.id,
        postIds: finished.socialPostIds,
      });
      return finished;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // A spec the renderer refuses is the copy's fault — too long to fit, or a
      // shape it will not lay out. Keeping that copy cached would make every
      // resume re-render the same unrenderable text and fail identically, so the
      // stage that produced it is forgotten and a resume writes it again.
      if (err instanceof BadRequestError) {
        await this.forgetState(runId, RUN_STATE_KEYS.copy);
        await this.forgetState(runId, RUN_STATE_KEYS.art);
        logger.info(
          { draftId: draft.id, runId, reason: message },
          'Discarded the cached copy so a resume rewrites it'
        );
      }

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
    const runId = await this.runIdForDraft(id);
    await this.tracker.succeed(runId, AGENT_STEP_KEYS.approval, approvedBy);

    if (draft.socialPostIds.length) {
      await socialMediaPostRepository.setStatusForPosts(draft.socialPostIds, PENDING_POST_STATUS);
      const scheduled = await this.drafts.markScheduled(
        id,
        draft.socialPostIds,
        draft.scheduledAt ?? new Date()
      );
      await this.tracker.succeed(
        runId,
        AGENT_STEP_KEYS.release,
        pluralise(draft.socialPostIds.length, 'post')
      );
      return scheduled;
    }

    // No posts created yet — create them with pending status so cron can pick them up
    const defaultGroup = await this.groups.findDefaultForUser(draft.userId);
    const targets = await this.resolveTargets(defaultGroup?.id, {}, draft.userId);
    if (!targets.length) {
      logger.warn({ draftId: id, userId: draft.userId }, 'Cannot auto-schedule: no connected page');
      await this.tracker.fail(runId, AGENT_STEP_KEYS.release, 'no live page to publish to');
      return approved;
    }

    const scheduledAt = await this.resolveSlot(await this.cadenceFor(defaultGroup?.id));
    const postIds = await this.createPostsForTargets(
      draft,
      targets,
      scheduledAt,
      PENDING_POST_STATUS
    );
    await this.drafts.markScheduled(id, postIds, scheduledAt);

    await this.tracker.succeed(runId, AGENT_STEP_KEYS.release, pluralise(postIds.length, 'post'));

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

    const runId = await this.runIdForDraft(id);
    await this.tracker.fail(runId, AGENT_STEP_KEYS.approval, reason);
    await this.tracker.skip(runId, AGENT_STEP_KEYS.release, 'rejected');

    return this.drafts.reject(id, reason);
  }

  private async runIdForDraft(draftId: string): Promise<string | null> {
    const run = await this.runs.findLatestByDraftId(draftId).catch(() => null);
    return run?.id ?? null;
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
      : await this.resolveSlot(await this.cadenceFor(payload.groupId));

    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestError('scheduledAt must be a future timestamp');
    }

    if (draft.socialPostIds.length) {
      await socialMediaPostRepository.reschedulePosts(draft.socialPostIds, scheduledAt);
      return this.drafts.markQueued(id, draft.socialPostIds, scheduledAt);
    }

    const targets = await this.resolveTargets(payload.groupId, payload, draft.userId);
    if (!targets.length) {
      throw new BadRequestError(
        'no connected page to publish to — add one to the group, or name a page'
      );
    }

    const postIds = await this.createPostsForTargets(
      draft,
      targets,
      scheduledAt,
      this.statusFor(draft)
    );
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
    return this.createPostsForTargets(draft, [target], scheduledAt, status);
  }

  /**
   * A group publishes the same draft to every switched-on page it holds, so one
   * brief becomes one row per destination — and per frame when it is a story.
   */
  private async createPostsForTargets(
    draft: PostDraft,
    targets: ReadonlyArray<{ platform: string; pageId: string }>,
    scheduledAt: Date,
    status: string
  ): Promise<string[]> {
    const perTarget = await Promise.all(
      targets.map(target => this.createPostsForTarget(draft, target, scheduledAt, status))
    );
    return perTarget.flat();
  }

  private async createPostsForTarget(
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
  private async queueForReview(
    id: string,
    brief: PostBriefPayload,
    runId: string | null = null
  ): Promise<Date | undefined> {
    if (!env.POST_AUTO_SCHEDULE) {
      await this.tracker.skip(runId, AGENT_STEP_KEYS.queue, 'auto-scheduling is off');
      return undefined;
    }

    const draft = (await this.drafts.findById(id)) as PostDraft;

    // A brief that names no group lands on the workspace's default brand, so a
    // hand-written post reaches the same pages the agents publish to.
    const groupId = brief.groupId ?? (await this.groups.findDefaultForUser(draft.userId))?.id;
    const targets = await this.resolveTargets(groupId, {}, draft.userId);
    if (!targets.length) {
      logger.warn(
        { draftId: id, userId: draft.userId, groupId },
        'No connected page to publish to — draft rendered but not queued'
      );
      await this.tracker.fail(runId, AGENT_STEP_KEYS.queue, 'no live page to publish to');
      return undefined;
    }

    if (!draft.slideUrls.length) {
      await this.tracker.skip(runId, AGENT_STEP_KEYS.queue, 'nothing rendered to queue');
      return undefined;
    }

    await this.tracker.waitingOn(runId, AGENT_STEP_KEYS.queue);

    const scheduledAt = await this.resolveSlot(await this.cadenceFor(groupId));
    // On autopilot the render goes straight into the publish cron's queue; by
    // hand it is held in review until someone signs it off. The workspace switch
    // decides that, so a brief typed by hand obeys the same setting.
    const autoPublish = brief.autoPublish ?? (await this.isWorkspaceOnAutopilot(draft.userId));
    const status = autoPublish ? PENDING_POST_STATUS : REVIEW_POST_STATUS;
    const postIds = await this.createPostsForTargets(draft, targets, scheduledAt, status);
    await this.drafts.markQueued(id, postIds, scheduledAt);

    await this.tracker.succeed(
      runId,
      AGENT_STEP_KEYS.queue,
      `${pluralise(targets.length, 'page')} · ${describeSlot(scheduledAt)}`
    );

    // Approval and release are the two stages a human still owns in manual mode.
    if (autoPublish) {
      await this.tracker.skip(runId, AGENT_STEP_KEYS.approval, 'autopilot');
    } else {
      await this.tracker.waitingOn(runId, AGENT_STEP_KEYS.approval);
      await requestPostReview(
        {
          userId: draft.userId,
          draftId: draft.id,
          topic: draft.topic,
          format: draft.format,
          slideCount: draft.slideUrls.length,
          postCount: postIds.length,
          scheduledAt,
        },
        this.users
      );
    }

    logger.info(
      { draftId: id, scheduledAt, brief: brief.topic, targets: targets.length, status },
      'Post queued'
    );
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

  /**
   * Every switched-on page of a group, or the single configured page when no
   * group is named. An empty group publishes nowhere rather than falling back
   * to some other page the brief never asked for.
   */
  private async resolveTargets(
    groupId: string | undefined,
    payload: SchedulePostPayload,
    userId?: string
  ): Promise<Array<{ platform: string; pageId: string }>> {
    if (groupId) {
      return this.groups.findActiveTargets(groupId);
    }

    const single = await this.resolveTarget(payload, userId);
    return single.pageId ? [single] : [];
  }

  /**
   * Resume a failed run instead of starting over. The working state is a cache,
   * so a run whose state has expired can only be redone from the top — which is
   * said plainly rather than silently repeating the expensive stages.
   */
  async resume(runId: string): Promise<PostDraft> {
    const brief = await cacheGet<PostBriefPayload & { format?: PostFormatName }>(
      runStateKey(runId, RUN_STATE_KEYS.brief)
    );

    if (!brief?.userId) {
      throw new ConflictError(
        'the working state for this run has expired — brief it again rather than resuming'
      );
    }

    return this.draftAndQueue(brief, brief.format ?? 'post', runId, brief.userId);
  }

  /** True while a failed run still holds enough state to pick up where it stopped. */
  async isResumable(runId: string): Promise<boolean> {
    const brief = await cacheGet<PostBriefPayload>(runStateKey(runId, RUN_STATE_KEYS.brief));
    return Boolean(brief?.userId);
  }

  /** Drop a cached stage so a resume runs it again instead of reusing it. */
  private async forgetState(runId: string | null, part: RunStateKey): Promise<void> {
    if (!runId) {
      return;
    }
    await cacheDelete(runStateKey(runId, part));
  }

  private async rememberState(
    runId: string | null,
    part: RunStateKey,
    value: unknown
  ): Promise<void> {
    if (!runId) {
      return;
    }
    await cacheSet(runStateKey(runId, part), value, env.AGENT_RUN_STATE_TTL_SECONDS);
  }

  /**
   * Run a stage, or hand back what a previous attempt already produced. The
   * cached branch still reports on the step so the timeline reads honestly.
   */
  private async reuseOrRun<T>(
    runId: string | null,
    step: (typeof AGENT_STEP_KEYS)[keyof typeof AGENT_STEP_KEYS],
    part: RunStateKey,
    operation: () => Promise<T>,
    describe: (result: T) => string
  ): Promise<T> {
    if (runId) {
      const cached = await cacheGet<T>(runStateKey(runId, part));
      if (cached) {
        await this.tracker.succeed(runId, step, `${describe(cached)} · reused`);
        return cached;
      }
    }

    const result = await this.tracker.track(runId, step, operation, describe);
    await this.rememberState(runId, part, result);
    return result;
  }

  /**
   * The draft a failed attempt already created. Reusing it keeps one run to one
   * post rather than leaving an orphan behind on every resume.
   */
  private async resumeDraft(
    runId: string | null,
    spec: PostSpec,
    copy: PostCopy
  ): Promise<PostDraft | null> {
    if (!runId) {
      return null;
    }

    const run = await this.runs.findById(runId).catch(() => null);
    if (!run?.draftId) {
      return null;
    }

    const existing = await this.drafts.findById(run.draftId);
    if (!existing) {
      return null;
    }

    return this.drafts.refreshSpec(existing.id, {
      spec: spec as unknown as Prisma.InputJsonValue,
      caption: buildFullCaption(copy),
      hashtags: copy.hashtags,
      claims: copy.claims,
    });
  }

  private async isWorkspaceOnAutopilot(userId: string): Promise<boolean> {
    const policy = await this.policies.findByUser(userId);
    return policy?.mode === AutomationMode.autopilot && policy.autoPublish;
  }

  private async cadenceFor(
    groupId?: string
  ): Promise<{ weekdays: number[]; hour: number; timeZone?: string } | undefined> {
    if (!groupId) {
      return undefined;
    }

    const cadence = await this.groups.findCadence(groupId);
    if (!cadence) {
      return undefined;
    }

    const weekdays = parseWeekdays(cadence.slotWeekdays);
    return weekdays.length
      ? { weekdays, hour: cadence.slotHour, timeZone: cadence.timezone || undefined }
      : undefined;
  }

  private async resolveSlot(cadence?: {
    weekdays: number[];
    hour: number;
    timeZone?: string;
  }): Promise<Date> {
    const taken = await this.drafts.findTakenSlots(new Date());
    return nextFreeSlot(taken, {
      weekdays: cadence?.weekdays ?? parseWeekdays(env.POST_SLOT_WEEKDAYS),
      hour: cadence?.hour ?? env.POST_SLOT_HOUR,
      timeZone: cadence?.timeZone,
    });
  }

  private async renderAndStore(
    id: string,
    spec: PostSpec,
    runId: string | null = null
  ): Promise<RenderResult> {
    const result = await this.tracker.track(
      runId,
      AGENT_STEP_KEYS.render,
      () => this.render.render(spec),
      rendered => pluralise(rendered.slides.length, 'frame')
    );

    if (result.passed) {
      await this.tracker.succeed(runId, AGENT_STEP_KEYS.audit, 'passed');
    } else {
      const blocking = result.findings.filter(finding => finding.severity === 'error').length;
      await this.tracker.fail(
        runId,
        AGENT_STEP_KEYS.audit,
        blocking ? `${pluralise(blocking, 'blocking finding')}` : 'did not pass'
      );
    }

    const slideUrls = await this.tracker.track(
      runId,
      AGENT_STEP_KEYS.assets,
      () => this.publishSlides(result),
      published => pluralise(published.length, 'frame')
    );

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
