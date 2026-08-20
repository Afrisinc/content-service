import type { AutomationMode } from '@prisma/client';
import type { SocialPlatformKey } from '@/types/socialMediaIntegration.types';

export interface AccountGroupCadence {
  autopilotEnabled: boolean;
  slotWeekdays: string;
  slotHour: number;
  timezone: string;
  postsPerRun: number;
}

export interface CreateAccountGroupPayload {
  name: string;
  description?: string;
  color?: string;
  isDefault?: boolean;
  accountIds?: string[];
  topics?: string[];
  serviceLine?: string;
  audience?: string;
  defaultFormat?: string;
  autopilotEnabled?: boolean;
  slotWeekdays?: string;
  slotHour?: number;
  timezone?: string;
  postsPerRun?: number;
}

export type UpdateAccountGroupPayload = Partial<CreateAccountGroupPayload> & {
  isActive?: boolean;
};

export interface AccountGroupMemberDTO {
  accountId: string;
  isActive: boolean;
  platform: SocialPlatformKey;
  pageId: string;
  pageName: string | null;
  pageAvatar: string | null;
  meta: string | null;
  accountIsActive: boolean;
  addedAt: string;
}

export interface AccountGroupDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  isDefault: boolean;
  isActive: boolean;
  autopilotEnabled: boolean;
  slotWeekdays: string;
  slotHour: number;
  timezone: string;
  postsPerRun: number;
  topics: string[];
  serviceLine: string | null;
  audience: string | null;
  defaultFormat: string;
  members: AccountGroupMemberDTO[];
  activeMemberCount: number;
  platforms: SocialPlatformKey[];
  createdAt: string;
  updatedAt: string;
}

/** One publishable destination resolved from a group. */
export interface GroupTarget {
  accountId: string;
  platform: string;
  pageId: string;
  pageName: string | null;
}

export interface AutomationPolicyDTO {
  mode: AutomationMode;
  autoPublish: boolean;
  defaultGroupId: string | null;
  maxPostsPerDay: number;
  /** Runs counted against today's cap, so the budget is visible before clicking. */
  postsUsedToday: number;
  pausedUntil: string | null;
  lastRunAt: string | null;
  autopilotGroupCount: number;
  activeAccountCount: number;
}

export interface UpdateAutomationPolicyPayload {
  mode?: AutomationMode;
  autoPublish?: boolean;
  defaultGroupId?: string | null;
  maxPostsPerDay?: number;
  pausedUntil?: string | null;
}

export interface AgentRunStepDTO {
  key: string;
  label: string;
  sequence: number;
  status: string;
  detail: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface AgentRunDTO {
  id: string;
  groupId: string | null;
  groupName: string | null;
  agent: string;
  trigger: string;
  status: string;
  topic: string | null;
  draftId: string | null;
  postIds: string[];
  accountsTargeted: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  steps: AgentRunStepDTO[];
  /** A failed run that still holds enough working state to pick up where it stopped. */
  resumable: boolean;
  /** A running run this instance can actually stop. */
  cancellable: boolean;
}
