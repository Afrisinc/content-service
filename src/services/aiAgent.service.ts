/**
 * AI Agent Service
 * Handles communication with external SM AI Agent service
 */

import { env } from '@/config/env';
import { AIAgentGeneratePostRequest, AIAgentGeneratePostResponse } from '@/types/aiGeneration.types';
import { logger } from '@/utils/logger';
import axios, { AxiosInstance } from 'axios';

class AIAgentService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.SM_AI_AGENT_URL,
      timeout: 60000,
    });
  }

  /**
   * Generate post using external AI Agent service
   */
  async generatePost(request: AIAgentGeneratePostRequest): Promise<AIAgentGeneratePostResponse> {
    try {
      const payload = {
        Topic: request.topic,
        'Keywords or Hashtags (optional)': request.keywords || '',
        'Link (optional)': request.link || '',
        submittedAt: request.submittedAt || new Date().toISOString(),
        formMode: request.formMode || 'production',
      };

      logger.info(
        {
          topic: request.topic,
          formMode: request.formMode,
        },
        'Calling external AI Agent service - available at ' + env.SM_AI_AGENT_URL
      );

      const response = await this.client.post('/sm-ai-agent', payload);

      return {
        success: true,
        data: response.data,
        message: 'Post generated successfully',
      };
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Error calling AI Agent service'
      );

      throw error;
    }
  }
}

export const aiAgentService = new AIAgentService();
