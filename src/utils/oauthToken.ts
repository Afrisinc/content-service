import { encrypt, decrypt } from './crypto';
import { logger } from './logger';
import { httpClient } from '@/config/http-client';
import type { SocialPlatformKey } from '@/types/socialMediaIntegration.types';

export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: 'short-lived' | 'long-lived';
}

const PLATFORM_ENDPOINTS: Record<SocialPlatformKey, { tokenUrl: string }> = {
  website: { tokenUrl: '' },
  facebook: { tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token' },
  /**
   * Instagram publishes through Instagram API with Facebook Login: the user
   * authenticates with Facebook and the token is a Facebook Page token, so the
   * exchange runs against graph.facebook.com. graph.instagram.com belongs to the
   * separate Instagram Login flow, whose tokens the publisher cannot use.
   */
  instagram: { tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token' },
  x: { tokenUrl: 'https://api.twitter.com/2/oauth2/token' },
  linkedin: { tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken' },
  tiktok: { tokenUrl: 'https://open.tiktok.com/oauth/access_token' },
  youtube: { tokenUrl: 'https://oauth2.googleapis.com/token' },
};

export async function exchangeAuthCodeForToken(
  platform: SocialPlatformKey,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<OAuthTokenResponse> {
  const endpoint = PLATFORM_ENDPOINTS[platform];
  try {
    if (!endpoint) {
      throw new Error(`OAuth endpoint not configured for platform: ${platform}`);
    }

    const response = await httpClient.post<OAuthTokenResponse>(endpoint.tokenUrl, {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });

    logger.info({ response: response.data, platform }, 'OAuth token response received');

    // Validate expires_in is a valid number, default to 5184000 (60 days) if missing
    const expiresIn =
      typeof response.data.expires_in === 'number' ? response.data.expires_in : 5184000;

    return {
      ...response.data,
      expires_in: expiresIn,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      {
        error,
        platform,
        clientId,
        redirectUri,
        endpoint: endpoint?.tokenUrl,
      },
      `OAuth token exchange failed: ${errorMsg}`
    );
    throw new Error(`Failed to exchange authorization code for ${platform}: ${errorMsg}`);
  }
}

export async function exchangeShortForLongLived(
  platform: SocialPlatformKey,
  shortLivedToken: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokenResponse> {
  try {
    if (platform !== 'facebook' && platform !== 'instagram') {
      throw new Error(`Long-lived token exchange not supported for ${platform}`);
    }

    const tokenUrl = PLATFORM_ENDPOINTS[platform].tokenUrl;
    const response = await httpClient.post<OAuthTokenResponse>(tokenUrl, {
      grant_type: 'fb_exchange_token',
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: shortLivedToken,
    });

    return response.data;
  } catch (error) {
    logger.error({ error }, `Long-lived token exchange failed for ${platform}`);
    throw new Error(
      `Failed to exchange for long-lived token: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export function encryptToken(token: string): string {
  return encrypt(token);
}

export function decryptToken(encryptedToken: string): string {
  return decrypt(encryptedToken);
}

export function calculateExpiresAt(expiresInSeconds: number): Date {
  const seconds =
    typeof expiresInSeconds === 'number' && expiresInSeconds > 0 ? expiresInSeconds : 5184000;
  return new Date(Date.now() + seconds * 1000);
}

export function isTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) {
    return false;
  }
  return new Date() >= expiresAt;
}

export function isTokenExpiringSoon(
  expiresAt: Date | null | undefined,
  bufferSeconds = 3600
): boolean {
  if (!expiresAt) {
    return false;
  }
  const expirationBuffer = new Date(expiresAt.getTime() - bufferSeconds * 1000);
  return new Date() >= expirationBuffer;
}

export interface FacebookPage {
  id: string;
  name: string;
  access_token?: string;
  category?: string;
  picture?: {
    data?: {
      height: number;
      is_silhouette: boolean;
      url: string;
      width: number;
    };
  };
  /** Populated only for Instagram: the IG professional account linked to this Page. */
  instagramBusinessAccount?: InstagramBusinessAccount | null;
}

export interface InstagramBusinessAccount {
  /** The IG User ID. This — not the Page id — is what publishing calls address. */
  id: string;
  username?: string;
  profilePictureUrl?: string;
}

export async function fetchFacebookPages(accessToken: string): Promise<FacebookPage[]> {
  try {
    const response = await httpClient.get<{ data: FacebookPage[] }>(
      'https://graph.facebook.com/v18.0/me/accounts',
      {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token,category,picture.width(200).height(200)',
        },
      }
    );

    const pages = response.data.data || [];
    logger.info(
      {
        pageCount: pages.length,
        pages: pages.map(p => ({ id: p.id, name: p.name, hasToken: !!p.access_token })),
      },
      'Facebook pages fetched successfully'
    );
    return pages;
  } catch (error) {
    logger.error(
      { error, accessToken: accessToken?.substring(0, 20) + '...' },
      'Failed to fetch Facebook pages'
    );
    throw error;
  }
}

/**
 * Resolve the Instagram professional account linked to a Page.
 *
 * Returns null when the Page has no linked account, which is a normal state the
 * caller presents as "not eligible" — only the user can create that link, from
 * Instagram or Page settings.
 */
export async function fetchInstagramBusinessAccount(
  pageId: string,
  pageAccessToken: string
): Promise<InstagramBusinessAccount | null> {
  try {
    const response = await httpClient.get<{
      instagram_business_account?: {
        id: string;
        username?: string;
        profile_picture_url?: string;
      };
    }>(`https://graph.facebook.com/v18.0/${pageId}`, {
      params: {
        access_token: pageAccessToken,
        fields: 'instagram_business_account{id,username,profile_picture_url}',
      },
    });

    const linked = response.data.instagram_business_account;
    if (!linked?.id) {
      logger.info({ pageId }, 'Page has no linked Instagram professional account');
      return null;
    }

    return {
      id: linked.id,
      username: linked.username,
      profilePictureUrl: linked.profile_picture_url,
    };
  } catch (error) {
    logger.warn(
      { pageId, error: error instanceof Error ? error.message : String(error) },
      'Failed to resolve Instagram account for Page'
    );
    return null;
  }
}
