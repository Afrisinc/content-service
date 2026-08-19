import axios, { AxiosInstance } from 'axios';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import type { NotifyCampaignRequest, NotifyCampaignResponse } from './notify.types';

const DEFAULT_TIMEOUT_MS = 30000;

/** Notify wraps successful payloads in `data`, but not on every deployment. */
function unwrap(body: unknown): NotifyCampaignResponse {
  const payload = body as { data?: NotifyCampaignResponse } & NotifyCampaignResponse;
  return payload?.data ?? payload;
}

export class NotifyClient {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({ timeout: DEFAULT_TIMEOUT_MS });
  }

  isConfigured(): boolean {
    return Boolean(env.NOTIFY_API_URL && env.NOTIFY_APP_ID && env.NOTIFY_ACCOUNT_ID);
  }

  async createCampaign(payload: NotifyCampaignRequest): Promise<NotifyCampaignResponse> {
    if (!this.isConfigured()) {
      throw new Error(
        'Notify is not configured: set NOTIFY_API_URL, NOTIFY_APP_ID and NOTIFY_ACCOUNT_ID'
      );
    }

    const url = `${env.NOTIFY_API_URL}/api/apps/${env.NOTIFY_APP_ID}/campaigns`;

    logger.info(
      { subject: payload.subject, tags: payload.recipientTags, scheduledAt: payload.scheduledAt },
      '[Notify] Creating campaign'
    );

    try {
      const response = await this.client.post(url, payload, {
        headers: { 'x-account-id': env.NOTIFY_ACCOUNT_ID, 'Content-Type': 'application/json' },
      });

      const campaign = unwrap(response.data);
      logger.info({ campaignId: campaign?.id }, '[Notify] Campaign created');
      return campaign;
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      // The response body can carry account identifiers, so only the status is logged.
      logger.error({ status, subject: payload.subject }, '[Notify] Campaign creation failed');
      throw new Error(`Notify campaign creation failed${status ? ` with status ${status}` : ''}`);
    }
  }
}

export const notifyClient = new NotifyClient();
