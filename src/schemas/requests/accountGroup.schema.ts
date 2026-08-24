const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;

const accountParams = {
  type: 'object',
  required: ['id', 'accountId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    accountId: { type: 'string', format: 'uuid' },
  },
} as const;

/** Shared between create and update so the two never drift apart. */
const groupProperties = {
  name: { type: 'string', minLength: 2, maxLength: 80 },
  description: { type: 'string', maxLength: 280 },
  color: {
    type: 'string',
    enum: ['azure', 'coral', 'primary', 'emerald', 'terra', 'gold', 'forest', 'indigo'],
  },
  isDefault: { type: 'boolean' },
  topics: { type: 'array', maxItems: 50, items: { type: 'string', minLength: 3, maxLength: 200 } },
  serviceLine: { type: 'string', maxLength: 60 },
  audience: { type: 'string', maxLength: 120 },
  defaultFormat: { type: 'string', enum: ['post', 'story', 'single'] },
  // Frames per post. Null takes the house length for the format.
  slideCount: { type: ['integer', 'null'], minimum: 1, maximum: 10 },
  autopilotEnabled: { type: 'boolean' },
  // Weekdays as 0=Sunday..6=Saturday, comma separated.
  slotWeekdays: { type: 'string', pattern: '^[0-6](,[0-6])*$' },
  slotHour: { type: 'integer', minimum: 0, maximum: 23 },
  timezone: { type: 'string', maxLength: 64 },
  postsPerRun: { type: 'integer', minimum: 1, maximum: 5 },
} as const;

export const ListAccountGroupsSchema = {
  description: 'List the caller’s brand groups with the accounts installed in each',
};

export const GetAccountGroupSchema = {
  description: 'Fetch one brand group',
  params: idParams,
};

export const CreateAccountGroupSchema = {
  description: 'Create a brand group and optionally seed it with connected accounts',
  body: {
    type: 'object',
    required: ['name'],
    additionalProperties: false,
    properties: {
      ...groupProperties,
      accountIds: {
        type: 'array',
        maxItems: 100,
        items: { type: 'string', format: 'uuid' },
      },
      // Omit to let this brand draw from the shared photograph library.
      assetIds: {
        type: 'array',
        maxItems: 200,
        items: { type: 'string', format: 'uuid' },
      },
    },
  },
};

export const UpdateAccountGroupSchema = {
  description: 'Rename a group, retune its cadence, or switch its autopilot on',
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      ...groupProperties,
      isActive: { type: 'boolean' },
    },
  },
};

export const DeleteAccountGroupSchema = {
  description: 'Delete a brand group. The connected accounts themselves are left installed.',
  params: idParams,
};

export const AddAccountsToGroupSchema = {
  description: 'Install connected accounts into a group',
  params: idParams,
  body: {
    type: 'object',
    required: ['accountIds'],
    additionalProperties: false,
    properties: {
      accountIds: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: { type: 'string', format: 'uuid' },
      },
    },
  },
};

export const RemoveAccountFromGroupSchema = {
  description: 'Take one account out of a group',
  params: accountParams,
};

export const SetGroupAccountActiveSchema = {
  description: 'Switch one account in a group on or off for publishing',
  params: accountParams,
  body: {
    type: 'object',
    required: ['isActive'],
    additionalProperties: false,
    properties: {
      isActive: { type: 'boolean' },
    },
  },
};

const assetParams = {
  type: 'object',
  required: ['id', 'assetId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    assetId: { type: 'string', format: 'uuid' },
  },
} as const;

export const ListGroupAssetsSchema = {
  description: 'The photographs this brand publishes with',
  params: idParams,
};

export const AssignGroupAssetsSchema = {
  description: 'Add photographs to a brand’s own library',
  params: idParams,
  body: {
    type: 'object',
    required: ['assetIds'],
    additionalProperties: false,
    properties: {
      assetIds: {
        type: 'array',
        minItems: 1,
        maxItems: 200,
        items: { type: 'string', format: 'uuid' },
      },
    },
  },
};

export const UnassignGroupAssetSchema = {
  description: 'Take a photograph out of a brand’s library',
  params: assetParams,
};

export const GetGroupTargetsSchema = {
  description: 'Where this group would publish right now',
  params: idParams,
};
