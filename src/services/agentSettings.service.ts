import { env } from '@/config/env';
import { parseNewsSettings } from '@/helpers/agentSettings.helper';
import { BadRequestError } from '@/utils/http-error';
import {
  agentSettingRepository,
  type AgentSettingRepository,
} from '@/repositories/agentSetting.repository';
import { NEWS_BATCH_SIZE_OPTIONS, type NewsAgentSettings } from '@/types/newsDesk.types';
import { logger } from '@/utils/logger';

export class AgentSettingsService {
  constructor(private readonly repository: AgentSettingRepository = agentSettingRepository) {}

  /** Degrades to the server default rather than stopping a run over an unreadable setting. */
  async getNewsSettings(): Promise<NewsAgentSettings> {
    try {
      const row = await this.repository.findByKey('news');
      return parseNewsSettings(row?.settings, env.NEWS_ENHANCE_BATCH_SIZE);
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'News agent settings unavailable, using the server default'
      );
      return { batchSize: env.NEWS_ENHANCE_BATCH_SIZE };
    }
  }

  async saveNewsSettings(batchSize: number, updatedBy: string): Promise<NewsAgentSettings> {
    if (!(NEWS_BATCH_SIZE_OPTIONS as readonly number[]).includes(batchSize)) {
      throw new BadRequestError(`batchSize must be one of ${NEWS_BATCH_SIZE_OPTIONS.join(', ')}`);
    }

    const existing = await this.repository.findByKey('news');
    const current = existing?.settings;
    const kept = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
    const row = await this.repository.save('news', { ...kept, batchSize }, updatedBy);

    logger.info({ updatedBy, batchSize }, 'News agent settings saved');
    return parseNewsSettings(row.settings, env.NEWS_ENHANCE_BATCH_SIZE);
  }
}

export const agentSettingsService = new AgentSettingsService();
