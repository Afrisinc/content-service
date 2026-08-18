import axios, { AxiosInstance } from 'axios';
import { logger } from '@/utils/logger';

export interface MediaDownloadOptions {
  maxSizeBytes?: number; // Default: 10MB for images, 4GB for videos
  timeout?: number; // Default: 30000ms
  allowedFormats?: string[]; // e.g., ['image/jpeg', 'image/png']
}

export interface DownloadedMedia {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  size: number;
  url: string;
}

export class MediaDownloader {
  private httpClient: AxiosInstance;
  private readonly DEFAULT_TIMEOUT = 30000;
  private readonly DEFAULT_IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly DEFAULT_VIDEO_MAX_SIZE = 4 * 1024 * 1024 * 1024; // 4GB
  private readonly ALLOWED_IMAGE_FORMATS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  private readonly ALLOWED_VIDEO_FORMATS = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
  private readonly MAX_CONCURRENT_DOWNLOADS = 5; // Limit concurrent downloads
  private activeDownloads = 0;

  constructor() {
    this.httpClient = axios.create({
      timeout: this.DEFAULT_TIMEOUT,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
  }

  /**
   * Download image from URL and validate format
   * Supports: JPEG, PNG, GIF, WebP
   */
  async downloadImage(imageUrl: string, options?: MediaDownloadOptions): Promise<DownloadedMedia> {
    logger.debug(`[MediaDownloader] Downloading image from ${imageUrl}`);

    try {
      this.validateUrl(imageUrl);

      const maxSize = options?.maxSizeBytes || this.DEFAULT_IMAGE_MAX_SIZE;
      const allowedFormats = options?.allowedFormats || this.ALLOWED_IMAGE_FORMATS;

      const media = await this.downloadMedia(imageUrl, maxSize, allowedFormats);

      logger.info(
        { url: imageUrl, size: media.size, mimeType: media.mimeType },
        '[MediaDownloader] Image downloaded successfully'
      );

      return media;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { url: imageUrl, error: errorMsg },
        '[MediaDownloader] Failed to download image'
      );
      throw new Error(`Failed to download image: ${errorMsg}`);
    }
  }

  /**
   * Download video from URL and validate format
   * Supports: MP4, MOV, AVI
   */
  async downloadVideo(videoUrl: string, options?: MediaDownloadOptions): Promise<DownloadedMedia> {
    logger.debug(`[MediaDownloader] Downloading video from ${videoUrl}`);

    try {
      this.validateUrl(videoUrl);

      const maxSize = options?.maxSizeBytes || this.DEFAULT_VIDEO_MAX_SIZE;
      const allowedFormats = options?.allowedFormats || this.ALLOWED_VIDEO_FORMATS;

      const media = await this.downloadMedia(videoUrl, maxSize, allowedFormats);

      logger.info(
        { url: videoUrl, size: media.size, mimeType: media.mimeType },
        '[MediaDownloader] Video downloaded successfully'
      );

      return media;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { url: videoUrl, error: errorMsg },
        '[MediaDownloader] Failed to download video'
      );
      throw new Error(`Failed to download video: ${errorMsg}`);
    }
  }

  /**
   * Convert image buffer to Base64 string
   * Useful for fallback or storing in database
   */
  bufferToBase64(media: DownloadedMedia): string {
    return `data:${media.mimeType};base64,${media.buffer.toString('base64')}`;
  }

  /**
   * Convert Base64 data URL to buffer and metadata
   * Handles data:image/jpeg;base64,... format
   */
  base64ToBuffer(dataUrl: string): DownloadedMedia {
    try {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        throw new Error('Invalid base64 data URL format');
      }

      const [, mimeType, base64Data] = match;
      const buffer = Buffer.from(base64Data, 'base64');

      return {
        buffer,
        mimeType,
        filename: `image_${Date.now()}.${this.getExtensionFromMimeType(mimeType)}`,
        size: buffer.length,
        url: dataUrl,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMsg }, '[MediaDownloader] Failed to convert base64 to buffer');
      throw new Error(`Failed to convert base64: ${errorMsg}`);
    }
  }

  /**
   * Format media for Facebook/Instagram posting
   * Returns the appropriate format based on platform requirements
   */
  formatForMeta(media: DownloadedMedia): string {
    // For Meta Graph API, we can use either:
    // 1. Direct URL (if publicly accessible)
    // 2. Base64 data URL (for dynamic/temporary content)
    // Prefer base64 for security and reliability
    return this.bufferToBase64(media);
  }

  /**
   * Internal: Download media from URL with validation
   */
  private async downloadMedia(
    url: string,
    maxSize: number,
    allowedFormats: string[]
  ): Promise<DownloadedMedia> {
    const response = await this.httpClient.get(url);

    const contentType = response.headers['content-type'] as string;
    const contentLength = parseInt(response.headers['content-length'] as string, 10);

    // Validate MIME type
    if (!allowedFormats.includes(contentType)) {
      throw new Error(
        `Invalid media format: ${contentType}. Allowed: ${allowedFormats.join(', ')}`
      );
    }

    // Validate size
    if (contentLength > maxSize) {
      throw new Error(
        `Media too large: ${this.formatBytes(contentLength)}. Max: ${this.formatBytes(maxSize)}`
      );
    }

    const buffer = Buffer.from(response.data);

    // Double-check buffer size
    if (buffer.length > maxSize) {
      throw new Error(
        `Downloaded media exceeds max size: ${this.formatBytes(buffer.length)}. ` +
          `Max: ${this.formatBytes(maxSize)}`
      );
    }

    const filename = this.extractFilename(url, contentType);

    return {
      buffer,
      mimeType: contentType,
      filename,
      size: buffer.length,
      url,
    };
  }

  /**
   * Validate URL format and protocol
   */
  private validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:', 'data:'].includes(parsed.protocol)) {
        throw new Error(`Invalid protocol: ${parsed.protocol}`);
      }
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
  }

  /**
   * Extract filename from URL or generate one
   */
  private extractFilename(url: string, mimeType: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();

      if (filename && filename.length > 0) {
        return filename;
      }
    } catch {
      logger.debug('[MediaDownloader] Could not extract filename from URL');
    }

    const ext = this.getExtensionFromMimeType(mimeType);
    return `media_${Date.now()}.${ext}`;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mapping: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
    };

    return mapping[mimeType] || 'bin';
  }

  /**
   * Format bytes to human-readable size
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) {
      return '0 Bytes';
    }
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Wait for concurrency slot to open
   * Limits simultaneous downloads to prevent network saturation
   */
  private async acquireDownloadSlot(): Promise<() => void> {
    while (this.activeDownloads >= this.MAX_CONCURRENT_DOWNLOADS) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.activeDownloads++;
    return () => {
      this.activeDownloads--;
    };
  }

  /**
   * Download multiple media items in parallel with concurrency control
   * Useful for carousel images
   */
  async downloadMultiple(
    urls: string[],
    mediaType: 'image' | 'video' = 'image'
  ): Promise<DownloadedMedia[]> {
    logger.debug({ count: urls.length, mediaType }, '[MediaDownloader] Starting parallel');

    const downloads = urls.map(async url => {
      const release = await this.acquireDownloadSlot();
      try {
        return mediaType === 'image'
          ? await this.downloadImage(url)
          : await this.downloadVideo(url);
      } finally {
        release();
      }
    });

    const results = await Promise.all(downloads);
    const totalSize = results.reduce((sum, m) => sum + m.size, 0);

    logger.info({ count: results.length, totalSize }, '[MediaDownloader] Parallel complete');

    return results;
  }
}

export const mediaDownloader = new MediaDownloader();
