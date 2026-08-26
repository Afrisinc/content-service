const POST_DRAFT_STATUSES = [
  'drafting',
  'rendered',
  'awaiting_approval',
  'approved',
  'scheduled',
  'rejected',
  'failed',
] as const;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

export const CreatePostDraftSchema = {
  description: 'Draft an AFRISINC post from a brief: copy, art direction, render and audit',
  body: {
    type: 'object',
    required: ['topic'],
    additionalProperties: false,
    properties: {
      topic: { type: 'string', minLength: 3, maxLength: 200 },
      format: { type: 'string', enum: ['post', 'story', 'single'], default: 'post' },
      serviceLine: { type: 'string', maxLength: 60 },
      offer: { type: 'string', maxLength: 60 },
      audience: { type: 'string', maxLength: 120 },
      keywords: { type: 'string', maxLength: 200 },
      link: { type: 'string', format: 'uri', maxLength: 500 },
      // Omit for the house length of five; ask explicitly for anything up to ten.
      slideCount: { type: 'integer', minimum: 1, maximum: 10 },
      // Publish to every switched-on account in this brand group. Omit for the
      // workspace default group.
      groupId: { type: 'string', format: 'uuid' },
      // Photographs picked by hand from the brand library; overrides automatic
      // subject matching and the group's library for this post.
      assetIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        maxItems: 20,
      },
    },
  },
};

export const GetPostDraftSchema = {
  description: 'Fetch one post draft with its audit report and frame URLs',
  params: idParams,
};

export const ListPostDraftsSchema = {
  description: 'List the caller’s post drafts',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: POST_DRAFT_STATUSES },
      format: { type: 'string', enum: ['post', 'story', 'single'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
};

export const RerenderPostDraftSchema = {
  description: 'Re-render a draft from its stored spec',
  params: idParams,
};

export const ApprovePostDraftSchema = {
  description: 'Sign off the claims and the artwork so the carousel can be scheduled',
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
};

export const RejectPostDraftSchema = {
  description: 'Reject a draft with a reason',
  params: idParams,
  body: {
    type: 'object',
    required: ['reason'],
    additionalProperties: false,
    properties: {
      reason: { type: 'string', minLength: 3, maxLength: 300 },
    },
  },
};

export const SchedulePostDraftSchema = {
  description:
    'Move a draft to a different slot, or queue one that was not auto-queued. Everything is optional: omit scheduledAt for the next free slot.',
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      platform: {
        type: 'string',
        enum: ['facebook', 'instagram', 'linkedin', 'twitter', 'tiktok'],
      },
      pageId: { type: 'string', minLength: 1, maxLength: 120 },
      groupId: { type: 'string', format: 'uuid' },
      scheduledAt: { type: 'string', format: 'date-time' },
    },
  },
};
