export const SOCIAL_PLATFORMS = ['website', 'facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'x'] as const;

export type SocialPlatformKey = (typeof SOCIAL_PLATFORMS)[number];

export enum TokenType {
  SHORT_LIVED = 'short-lived',
  LONG_LIVED = 'long-lived',
}

export interface SaveIntegrationCredentialsPayload {
  appId: string;
  appSecret: string;
}

export interface AddSocialMediaAccountPayload {
  name: string;
  meta?: string;
  scopes?: string[];
}

export interface SocialMediaAccountDTO {
  id: string;
  name: string;
  meta: string | null;
  scopes: string[];
  createdAt: string;
}

export interface SocialMediaIntegrationDTO {
  platform: SocialPlatformKey;
  appId: string | null;
  connected: boolean;
  syncedAt: string | null;
  accounts: SocialMediaAccountDTO[];
}
