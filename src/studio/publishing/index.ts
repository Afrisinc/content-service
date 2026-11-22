import type { SocialPlatform } from '@prisma/client';
import { BadRequestError } from '@/utils/http-error';
import { FacebookPublishingProvider, InstagramPublishingProvider } from './meta.provider';
import { TikTokPublishingProvider } from './tiktok.provider';
import { YouTubePublishingProvider } from './youtube.provider';
import type { PublishingProvider } from './provider';

const registry = new Map<SocialPlatform, PublishingProvider>();

function seed(): void {
  if (registry.size > 0) {
    return;
  }
  for (const provider of [
    new YouTubePublishingProvider(),
    new InstagramPublishingProvider(),
    new FacebookPublishingProvider(),
    new TikTokPublishingProvider(),
  ]) {
    registry.set(provider.platform, provider);
  }
}

export function getPublishingProvider(platform: SocialPlatform): PublishingProvider {
  seed();
  const provider = registry.get(platform);
  if (!provider) {
    throw new BadRequestError(`no publishing provider is registered for ${platform}`);
  }
  return provider;
}

export function registerPublishingProvider(provider: PublishingProvider): void {
  seed();
  registry.set(provider.platform, provider);
}

export function supportedPlatforms(): SocialPlatform[] {
  seed();
  return [...registry.keys()];
}

export * from './provider';
export {
  YouTubePublishingProvider,
  TikTokPublishingProvider,
  FacebookPublishingProvider,
  InstagramPublishingProvider,
};
