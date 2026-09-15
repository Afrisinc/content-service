import type { SocialPlatform } from '@prisma/client';
import type { UploadInput, UploadResult } from '../contracts';

export interface PublishCredentials {
  accessToken: string;
  refreshToken?: string;
  accountId: string;
  expiresAt?: Date | null;
}

export interface PublishingProvider {
  readonly platform: SocialPlatform;
  readonly supportsScheduling: boolean;
  uploadVideo(input: UploadInput, credentials: PublishCredentials): Promise<UploadResult>;
  updateMetadata(
    externalId: string,
    input: UploadInput,
    credentials: PublishCredentials
  ): Promise<void>;
  publish(externalId: string, credentials: PublishCredentials): Promise<UploadResult>;
  getStatus(externalId: string, credentials: PublishCredentials): Promise<UploadResult>;
}
