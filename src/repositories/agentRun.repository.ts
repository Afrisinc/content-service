/**
 * Agent Run Repository
 * Database operations for the agent activity log the automation view reports from
 */

import { prisma } from '@/database/prismaClient';
import { AgentRunStatus, AgentStepStatus, Prisma, PrismaClient } from '@prisma/client';

const MAX_PAGE_SIZE = 100;

const withGroup = {
  group: { select: { id: true, name: true } },
  steps: { orderBy: { sequence: 'asc' } },
} satisfies Prisma.AgentRunInclude;

export type AgentRunWithGroup = Prisma.AgentRunGetPayload<{ include: typeof withGroup }>;

export interface StartAgentRunInput {
  userId: string;
  groupId?: string | null;
  agent: string;
  trigger: string;
  topic?: string;
}

export interface FinishAgentRunInput {
  status: AgentRunStatus;
  draftId?: string;
  postIds?: string[];
  accountsTargeted?: number;
  errorMessage?: string;
}

export interface ListAgentRunsParams {
  userId: string;
  groupId?: string;
  agent?: string;
  status?: AgentRunStatus;
  page?: number;
  limit?: number;
}

export class AgentRunRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async start(data: StartAgentRunInput) {
    return this.prisma.agentRun.create({
      data: { ...data, status: AgentRunStatus.running },
    });
  }

  async finish(id: string, data: FinishAgentRunInput) {
    return this.prisma.agentRun.update({
      where: { id },
      data: { ...data, finishedAt: new Date() },
    });
  }

  async findByIdForUser(id: string, userId: string) {
    return this.prisma.agentRun.findFirst({ where: { id, userId }, include: withGroup });
  }

  /**
   * Put a failed run back in flight. Stages that succeeded keep their result and
   * stay green; only the ones that never finished go back to pending, so the
   * resumed run reports as a continuation rather than a fresh attempt.
   */
  async reopenRun(runId: string) {
    await this.prisma.agentRunStep.updateMany({
      where: {
        runId,
        status: { in: [AgentStepStatus.failed, AgentStepStatus.skipped] },
      },
      data: {
        status: AgentStepStatus.pending,
        startedAt: null,
        finishedAt: null,
        errorMessage: null,
        detail: null,
      },
    });

    return this.prisma.agentRun.update({
      where: { id: runId },
      data: { status: AgentRunStatus.running, finishedAt: null, errorMessage: null },
    });
  }

  /** A workspace runs one batch at a time — a second trigger joins the first. */
  async findActiveForUser(userId: string) {
    return this.prisma.agentRun.findFirst({
      where: { userId, status: AgentRunStatus.running },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true, topic: true },
    });
  }

  /**
   * Runs still marked running long after they should have finished. A process
   * that died mid-run leaves these behind, and the UI would spin on them for
   * ever unless they are closed out.
   */
  async findStale(startedBefore: Date, limit = 100) {
    return this.prisma.agentRun.findMany({
      where: { status: AgentRunStatus.running, startedAt: { lt: startedBefore } },
      select: { id: true },
      take: limit,
    });
  }

  async failRuns(ids: string[], errorMessage: string) {
    if (!ids.length) {
      return { count: 0 };
    }

    await this.prisma.agentRunStep.updateMany({
      where: {
        runId: { in: ids },
        status: { in: [AgentStepStatus.pending, AgentStepStatus.running] },
      },
      data: { status: AgentStepStatus.skipped, finishedAt: new Date() },
    });

    return this.prisma.agentRun.updateMany({
      where: { id: { in: ids } },
      data: { status: AgentRunStatus.failed, errorMessage, finishedAt: new Date() },
    });
  }

  async findById(id: string) {
    return this.prisma.agentRun.findUnique({
      where: { id },
      select: { id: true, userId: true, draftId: true, status: true, groupId: true },
    });
  }

  /** The run that produced a draft, so a later approval lands on the same trace. */
  async findLatestByDraftId(draftId: string) {
    return this.prisma.agentRun.findFirst({
      where: { draftId },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
  }

  /** Draw the whole pipeline up front; each stage fills in as it happens. */
  async seedSteps(
    runId: string,
    steps: ReadonlyArray<{ key: string; label: string; sequence: number }>
  ) {
    return this.prisma.agentRunStep.createMany({
      data: steps.map(step => ({ runId, ...step })),
      skipDuplicates: true,
    });
  }

  async startStep(runId: string, key: string) {
    return this.prisma.agentRunStep.updateMany({
      where: { runId, key },
      data: { status: AgentStepStatus.running, startedAt: new Date(), errorMessage: null },
    });
  }

  async finishStep(
    runId: string,
    key: string,
    data: { status: AgentStepStatus; detail?: string; errorMessage?: string }
  ) {
    return this.prisma.agentRunStep.updateMany({
      where: { runId, key },
      data: { ...data, finishedAt: new Date() },
    });
  }

  /**
   * A run that blew up leaves stages that never got their turn. Marking them
   * skipped stops the UI showing a spinner that will never resolve.
   */
  async abandonUnfinishedSteps(runId: string) {
    return this.prisma.agentRunStep.updateMany({
      where: {
        runId,
        status: { in: [AgentStepStatus.pending, AgentStepStatus.running] },
      },
      data: { status: AgentStepStatus.skipped, finishedAt: new Date() },
    });
  }

  async list(params: ListAgentRunsParams) {
    const limit = Math.min(params.limit ?? 20, MAX_PAGE_SIZE);
    const page = Math.max(params.page ?? 1, 1);
    const where: Prisma.AgentRunWhereInput = {
      userId: params.userId,
      ...(params.groupId ? { groupId: params.groupId } : {}),
      ...(params.agent ? { agent: params.agent } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.agentRun.findMany({
        where,
        include: withGroup,
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.agentRun.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** Guards `maxPostsPerDay` — counts what the agents already shipped today. */
  async countSince(userId: string, since: Date): Promise<number> {
    return this.prisma.agentRun.count({
      where: {
        userId,
        startedAt: { gte: since },
        status: { in: [AgentRunStatus.running, AgentRunStatus.succeeded] },
      },
    });
  }

  /** A group produces at most one autopilot batch per posting day. */
  async countForGroupSince(groupId: string, since: Date): Promise<number> {
    return this.prisma.agentRun.count({
      where: {
        groupId,
        startedAt: { gte: since },
        status: { in: [AgentRunStatus.running, AgentRunStatus.succeeded] },
      },
    });
  }

  /**
   * Drafts this brand produced recently. `draftId` is a plain column rather than
   * a relation, so the schedule is counted in a second query against them.
   */
  async findDraftIdsForGroup(groupId: string, limit = 50): Promise<string[]> {
    const rows = await this.prisma.agentRun.findMany({
      where: {
        groupId,
        draftId: { not: null },
        status: { in: [AgentRunStatus.running, AgentRunStatus.succeeded] },
      },
      select: { draftId: true },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return rows
      .map((row: { draftId: string | null }) => row.draftId)
      .filter((id: string | null): id is string => id !== null);
  }

  /** Topics the group has already covered lately, so the agent does not repeat itself. */
  async findRecentTopics(groupId: string, limit = 20): Promise<string[]> {
    const rows = await this.prisma.agentRun.findMany({
      where: { groupId, topic: { not: null } },
      select: { topic: true },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
    return rows
      .map((row: { topic: string | null }) => row.topic)
      .filter((topic: string | null): topic is string => topic !== null);
  }

  async summariseForUser(userId: string, since: Date) {
    const grouped = await this.prisma.agentRun.groupBy({
      by: ['status'],
      where: { userId, startedAt: { gte: since } },
      _count: { _all: true },
    });

    return grouped.reduce<Record<string, number>>((totals, row) => {
      totals[row.status] = row._count._all;
      return totals;
    }, {});
  }
}

export const agentRunRepository = new AgentRunRepository();
