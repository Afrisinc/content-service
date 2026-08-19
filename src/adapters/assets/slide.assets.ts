import { getAssetsClient } from '@/utils/assets-client';
import { ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';

export interface SlideFile {
  filename: string;
  body: Buffer;
}

export interface SlideAssetPublisher {
  publish(slug: string, files: SlideFile[]): Promise<string[]>;
}

/** Set at bootstrap in server.ts alongside the assets client. */
function socialMediaFolderId(): string | undefined {
  const id = (globalThis as { SOCIAL_MEDIA_FOLDER_ID?: string }).SOCIAL_MEDIA_FOLDER_ID;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

class AssetsSlidePublisher implements SlideAssetPublisher {
  /**
   * Instagram never accepts a binary upload — it fetches the image from a URL it can
   * reach itself. The render service is internal and API-key gated, so every frame is
   * copied to the assets service and the public URL is what gets scheduled.
   */
  async publish(slug: string, files: SlideFile[]): Promise<string[]> {
    const client = getAssetsClient();
    const folderId = socialMediaFolderId();

    // Bounded by the ten-frame ceiling.
    const assets = await Promise.all(
      files.map(file =>
        client.uploadBuffer(file.body, `${slug}-${file.filename}`, {
          folderId,
          tags: ['post', slug],
        })
      )
    );

    const urls = assets.map(asset => asset?.url).filter((url): url is string => Boolean(url));

    if (urls.length !== files.length) {
      logger.error(
        { slug, expected: files.length, received: urls.length },
        'Assets service did not return a URL for every slide'
      );
      throw new ServerError('the assets service did not return a URL for every slide');
    }

    return urls;
  }
}

let instance: SlideAssetPublisher | null = null;

export function getSlideAssetPublisher(): SlideAssetPublisher {
  if (!instance) {
    instance = new AssetsSlidePublisher();
  }
  return instance;
}

export function setSlideAssetPublisher(publisher: SlideAssetPublisher | null): void {
  instance = publisher;
}
