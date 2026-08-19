export const RunNewsletterDigestSchema = {
  description: 'Build and schedule the daily newsletter digest immediately',
  tags: ['newsletter'],
  body: {
    type: 'object',
    properties: {
      dryRun: {
        type: 'boolean',
        default: false,
        description: 'Generate and store the campaign as a draft without handing it to Notify',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        resp_msg: { type: 'string' },
        resp_code: { type: 'integer' },
        data: {
          type: 'object',
          additionalProperties: true,
          properties: {
            status: { type: 'string', enum: ['sent', 'skipped', 'dry-run'] },
            reason: { type: 'string' },
            notifyCampaignId: { type: ['string', 'null'] },
            subject: { type: 'string' },
            articleIds: { type: 'array', items: { type: 'string' } },
            scheduledAt: { type: 'string' },
            html: { type: 'string', description: 'Only returned for a dry run' },
          },
        },
      },
    },
  },
};
