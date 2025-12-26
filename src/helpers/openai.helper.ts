/**
 * OpenAI Helper
 * Handles all OpenAI API interactions for content generation
 */

import { logger } from '@/utils/logger';
import OpenAI from 'openai';

export interface AIGenerationRequest {
  prompt: string;
  maxLength?: number;
  tone?: 'professional' | 'casual' | 'humorous' | 'promotional';
  includeEmojis?: boolean;
  includeHashtags?: boolean;
  language?: string;
  platform?: 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'tiktok';
}

export interface AIGeneratedContent {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  tiktok?: string;
  hashtags?: string[];
  metadata: {
    model: string;
    provider: string;
    generationPrompt: string;
    timestamp: string;
    tokensUsed?: number;
  };
}

class OpenAIHelper {
  private client: OpenAI;
  private textModel: string;
  private imageModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      logger.warn('OPENAI_API_KEY is not configured');
    }

    this.client = new OpenAI({
      apiKey: apiKey || '',
    });

    this.textModel = process.env.OPENAI_TEXT_MODEL || 'gpt-4';
    this.imageModel = process.env.OPENAI_IMAGE_MODEL || 'dall-e-3';
  }

  /**
   * Validate OpenAI configuration
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!process.env.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY environment variable is not set');
    }

    if (!this.textModel) {
      errors.push('OPENAI_TEXT_MODEL environment variable is not set');
    }

    if (!this.imageModel) {
      errors.push('OPENAI_IMAGE_MODEL environment variable is not set');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build system prompt for content generation
   */
  private buildSystemPrompt(config: AIGenerationRequest): string {
    const parts = [
      'You are a professional social media content creator.',
      'Generate engaging, authentic, and platform-appropriate content.',
    ];

    if (config.tone) {
      parts.push(`Use a ${config.tone} tone.`);
    }

    if (config.language) {
      parts.push(`Write in ${config.language}.`);
    }

    if (config.includeEmojis) {
      parts.push('Include relevant emojis to increase engagement.');
    }

    if (config.includeHashtags) {
      parts.push('Include relevant hashtags at the end.');
    }

    if (config.maxLength) {
      parts.push(
        `Keep content under ${config.maxLength} characters for each platform.`
      );
    }

    return parts.join(' ');
  }

  /**
   * Build user message for content generation
   */
  private buildUserMessage(request: AIGenerationRequest): string {
    if (request.platform) {
      return `Create a social media post for ${request.platform} based on this prompt: ${request.prompt}`;
    }

    return `Create engaging social media posts for Facebook and Instagram based on this prompt: ${request.prompt}.

    Return the response in JSON format with the following structure:
    {
      "facebook": "content for facebook",
      "instagram": "content for instagram",
      "hashtags": ["tag1", "tag2"]
    }`;
  }

  /**
   * Generate content using OpenAI API with official SDK
   */
  async generateContent(
    request: AIGenerationRequest
  ): Promise<AIGeneratedContent> {
    const config = this.validateConfiguration();
    if (!config.valid) {
      throw new Error(
        `OpenAI configuration invalid: ${config.errors.join(', ')}`
      );
    }

    try {
      logger.info(
        {
          prompt: request.prompt.substring(0, 100),
          platform: request.platform,
          model: this.textModel,
        },
        'Generating content with OpenAI'
      );

      const message = await this.client.chat.completions.create({
        model: this.textModel,
        max_tokens: request.maxLength ? request.maxLength * 2 : 1024,
        messages: [
          {
            role: 'system',
            content: this.buildSystemPrompt(request),
          },
          {
            role: 'user',
            content: this.buildUserMessage(request),
          },
        ],
        temperature: 0.7,
      });

      const content = message.choices[0].message.content || '';

      if (!content) {
        throw new Error('No content received from OpenAI');
      }

      // Parse the response
      let parsedContent: Record<string, any>;
      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[0]);
        } else {
          // If no JSON found, treat entire response as single platform content
          const platform = request.platform || 'facebook';
          parsedContent = request.platform
            ? { [platform]: content }
            : { facebook: content, instagram: content };
        }
      } catch {
        // If JSON parsing fails, treat as plain text
        const platform = request.platform || 'facebook';
        parsedContent = request.platform
          ? { [platform]: content }
          : { facebook: content, instagram: content };
      }

      const result: AIGeneratedContent = {
        facebook: parsedContent.facebook,
        instagram: parsedContent.instagram,
        twitter: parsedContent.twitter,
        linkedin: parsedContent.linkedin,
        tiktok: parsedContent.tiktok,
        hashtags: parsedContent.hashtags || [],
        metadata: {
          model: this.textModel,
          provider: 'openai',
          generationPrompt: request.prompt,
          timestamp: new Date().toISOString(),
          tokensUsed: message.usage?.completion_tokens,
        },
      };

      logger.info(
        {
          platforms: Object.keys(result).filter(k => k !== 'metadata'),
          tokensUsed: message.usage?.completion_tokens,
        },
        'Content generation successful'
      );

      return result;
    } catch (error) {
      logger.error(
        {
          prompt: request.prompt.substring(0, 100),
          error: error instanceof Error ? error.message : String(error),
        },
        'Content generation failed'
      );
      throw error;
    }
  }

  /**
   * Generate content for specific platform
   */
  async generateContentForPlatform(
    request: AIGenerationRequest
  ): Promise<string> {
    const result = await this.generateContent(request);

    const platform = request.platform || 'facebook';
    const content = result[platform as keyof AIGeneratedContent];

    if (!content || typeof content !== 'string') {
      throw new Error(`No content generated for platform: ${platform}`);
    }

    return content;
  }

  /**
   * Generate content for multiple platforms
   */
  async generateContentForMultiplePlatforms(
    request: AIGenerationRequest,
    platforms: Array<
      'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'tiktok'
    >
  ): Promise<Record<string, string>> {
    const result = await this.generateContent(request);
    const output: Record<string, string> = {};

    for (const platform of platforms) {
      const content = result[platform];
      if (content && typeof content === 'string') {
        output[platform] = content;
      }
    }

    return output;
  }

  /**
   * Stream content generation for real-time display
   */
  async *generateContentStream(
    request: AIGenerationRequest
  ): AsyncGenerator<string, void, unknown> {
    const config = this.validateConfiguration();
    if (!config.valid) {
      throw new Error(
        `OpenAI configuration invalid: ${config.errors.join(', ')}`
      );
    }

    try {
      logger.info(
        {
          prompt: request.prompt.substring(0, 100),
          streaming: true,
        },
        'Starting streaming content generation'
      );

      const stream = await this.client.chat.completions.create({
        model: this.textModel,
        max_tokens: request.maxLength ? request.maxLength * 2 : 1024,
        messages: [
          {
            role: 'system',
            content: this.buildSystemPrompt(request),
          },
          {
            role: 'user',
            content: this.buildUserMessage(request),
          },
        ],
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          yield chunk.choices[0].delta.content;
        }
      }

      logger.info({}, 'Streaming content generation completed');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Content streaming failed'
      );
      throw error;
    }
  }

  /**
   * Generate content with vision (image analysis)
   */
  async generateContentWithVision(
    imageUrl: string,
    prompt: string
  ): Promise<string> {
    const config = this.validateConfiguration();
    if (!config.valid) {
      throw new Error(
        `OpenAI configuration invalid: ${config.errors.join(', ')}`
      );
    }

    try {
      logger.info(
        {
          imageUrl: imageUrl.substring(0, 50),
          model: this.textModel,
        },
        'Generating content from image'
      );

      const message = await this.client.chat.completions.create({
        model: this.textModel,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      const content = message.choices[0].message.content || '';

      if (!content) {
        throw new Error('No content generated from image');
      }

      return content;
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Vision content generation failed'
      );
      throw error;
    }
  }

  /**
   * Generate image using DALL-E
   */
  async generateImage(
    prompt: string,
    style?: 'realistic' | 'cartoon' | 'abstract' | 'minimalist'
  ): Promise<string> {
    const config = this.validateConfiguration();
    if (!config.valid) {
      throw new Error(
        `OpenAI configuration invalid: ${config.errors.join(', ')}`
      );
    }

    try {
      const stylePrompt = style ? ` in a ${style} style` : '';

      logger.info(
        {
          prompt: prompt.substring(0, 50),
          style: style || 'default',
        },
        'Generating image with DALL-E'
      );

      const response = await this.client.images.generate({
        model: this.imageModel,
        prompt: `${prompt}${stylePrompt}`,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No image generated');
      }

      const imageUrl = response.data[0].url;
      if (!imageUrl) {
        throw new Error('Image URL not returned from API');
      }

      logger.info(
        {
          prompt: prompt.substring(0, 50),
        },
        'Image generation successful'
      );

      return imageUrl;
    } catch (error) {
      logger.error(
        {
          prompt: prompt.substring(0, 50),
          error: error instanceof Error ? error.message : String(error),
        },
        'Image generation failed'
      );
      throw error;
    }
  }

  /**
   * Get model information
   */
  getModelInfo(): { textModel: string; imageModel: string; provider: string } {
    return {
      textModel: this.textModel,
      imageModel: this.imageModel,
      provider: 'openai',
    };
  }
}

export const openaiHelper = new OpenAIHelper();
