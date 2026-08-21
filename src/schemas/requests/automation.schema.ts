const AGENT_RUN_STATUSES = ['running', 'succeeded', 'failed', 'skipped'] as const;

export const GetAutomationPolicySchema = {
  description: 'The workspace automation switch: by hand, or agents driving',
};

export const UpdateAutomationPolicySchema = {
  description: 'Switch the workspace between manual and autopilot, and tune its limits',
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      mode: { type: 'string', enum: ['manual', 'autopilot'] },
      autoPublish: { type: 'boolean' },
      defaultGroupId: { type: ['string', 'null'], format: 'uuid' },
      maxPostsPerDay: { type: 'integer', minimum: 1, maximum: 50 },
      pausedUntil: { type: ['string', 'null'], format: 'date-time' },
    },
  },
};

export const ListAgentRunsSchema = {
  description: 'What the agents have run, newest first',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      groupId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: AGENT_RUN_STATUSES },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
};

export const GetAgentRunSchema = {
  description: 'One agent run with every stage of its pipeline, for the live tracker',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
};

export const GetAutomationSummarySchema = {
  description: 'Today’s agent run counts by status',
};

export const ResumeAgentRunSchema = {
  description:
    'Pick a failed run back up from the stage that broke, reusing the work that ' +
    'already succeeded rather than starting over.',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
};

export const CancelAgentRunSchema = {
  description: 'Stop a run that is still going and free the workspace run slot',
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {},
  },
};

export const GetActiveAgentRunSchema = {
  description: 'The run in flight for this workspace, if any',
};

export const RunAutomationNowSchema = {
  description:
    'Start an agent pass. Returns as soon as the work is accepted; follow it in ' + 'the run log.',
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      // Omit to run every brand whose agents are on; name one to run just it.
      groupId: { type: 'string', format: 'uuid' },
    },
  },
};
