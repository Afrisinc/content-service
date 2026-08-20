import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialMediaIntegrationService } from '@/services/socialMediaIntegration.service';
import { socialMediaIntegrationRepository } from '@/repositories/socialMediaIntegration.repository';
import { socialMediaAccountRepository } from '@/repositories/socialMediaAccount.repository';
import { httpClient } from '@/config/http-client';
import * as oauthTokenUtils from '@/utils/oauthToken';
import { getRateLimiter } from '@/utils/rateLimiter';

vi.mock('@/repositories/socialMediaIntegration.repository');
vi.mock('@/repositories/socialMediaAccount.repository');
vi.mock('@/config/http-client');
vi.mock('@/utils/crypto', () => ({
  encrypt: (text: string) => `encrypted-${text}`,
  decrypt: (text: string) => text.replace('encrypted-', ''),
}));

describe('OAuth Integration Flow', () => {
  let service: SocialMediaIntegrationService;
  const userId = 'test-user-id';
  const platform = 'facebook';
  const authCode = 'auth-code-from-facebook';
  const state = 'state-token-123';
  const redirectUri = 'http://localhost:3000/social-media/oauth/callback/facebook';

  beforeEach(() => {
    service = new SocialMediaIntegrationService();
    vi.clearAllMocks();
    // Reset rate limiter state between tests
    const rateLimiter = getRateLimiter();
    rateLimiter.destroy();
  });

  describe('Complete Facebook OAuth Flow', () => {
    it('should exchange auth code for tokens and store in database', async () => {
      // Mock integration (credentials already saved)
      const mockIntegration = {
        id: 'integration-id',
        userId,
        platform,
        appId: 'app-id-123',
        appSecretEnc: 'encrypted-secret',
        syncedAt: new Date(),
      };

      // Mock account lookup by state
      const mockAccount = {
        id: 'account-id',
        userId,
        platform,
        pageId: 'page-id',
        pageName: 'Test Page',
        oauthState: state,
        shortLivedToken: null,
        longLivedToken: null,
      };

      // Mock Facebook's short-lived token response
      const shortLivedResponse = {
        status: 200,
        data: {
          access_token: 'short-lived-token-abc',
          token_type: 'bearer',
          expires_in: 3600, // 1 hour
        },
        headers: {},
      };

      // Mock Facebook's long-lived token response
      const longLivedResponse = {
        status: 200,
        data: {
          access_token: 'long-lived-token-xyz',
          token_type: 'bearer',
          expires_in: 5184000, // ~60 days
        },
        headers: {},
      };

      // Setup mocks
      vi.mocked(socialMediaAccountRepository.findByOAuthState as any).mockResolvedValue(
        mockAccount as any
      );
      vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform as any).mockResolvedValue(
        mockIntegration as any
      );
      vi.mocked(httpClient.post).mockResolvedValueOnce(shortLivedResponse as any);
      vi.mocked(httpClient.post).mockResolvedValueOnce(longLivedResponse as any);
      vi.mocked(socialMediaAccountRepository.updateTokens as any).mockResolvedValue({} as any);

      // Execute OAuth callback
      const result = await service.handleOAuthCallback(
        platform as any,
        authCode,
        state,
        redirectUri
      );

      // Assertions
      expect(result).toEqual({
        accountId: 'account-id',
        platform: 'facebook',
        connected: true,
        expiresAt: expect.any(String),
        pages: expect.any(Array),
      });

      // Verify updateTokens was called with encrypted tokens
      expect(socialMediaAccountRepository.updateTokens).toHaveBeenCalledWith(
        'account-id',
        expect.objectContaining({
          accessToken: expect.stringMatching(/^encrypted-/),
          shortLivedToken: expect.stringMatching(/^encrypted-/),
          longLivedToken: expect.stringMatching(/^encrypted-/),
          tokenType: 'LONG_LIVED',
        })
      );

      // Verify API calls were made
      expect(httpClient.post).toHaveBeenCalledTimes(2);
    });

    it('should handle invalid state token (CSRF protection)', async () => {
      // Mock no account found with that state
      vi.mocked(socialMediaAccountRepository.findByOAuthState as any).mockResolvedValue(null);

      // Should throw error
      await expect(
        service.handleOAuthCallback(platform as any, authCode, 'invalid-state', redirectUri)
      ).rejects.toThrow('Invalid OAuth state token');

      // Verify no further calls were made
      expect(socialMediaIntegrationRepository.findByUserAndPlatform).not.toHaveBeenCalled();
      expect(httpClient.post).not.toHaveBeenCalled();
    });

    it('should handle missing integration credentials', async () => {
      const mockAccount = {
        id: 'account-id',
        userId,
        platform,
        oauthState: state,
      };

      vi.mocked(socialMediaAccountRepository.findByOAuthState as any).mockResolvedValue(
        mockAccount as any
      );
      vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform as any).mockResolvedValue(
        null
      );

      await expect(
        service.handleOAuthCallback(platform as any, authCode, state, redirectUri)
      ).rejects.toThrow(`No integration found for ${platform}`);

      expect(httpClient.post).not.toHaveBeenCalled();
    });

    it('should gracefully handle long-lived token exchange failure', async () => {
      const mockIntegration = {
        userId,
        platform,
        appId: 'app-id-123',
        appSecretEnc: 'encrypted-secret',
      };

      const mockAccount = {
        id: 'account-id',
        userId,
        platform,
        oauthState: state,
      };

      const shortLivedResponse = {
        status: 200,
        data: {
          access_token: 'short-lived-token',
          token_type: 'bearer',
          expires_in: 3600,
        },
        headers: {},
      };

      vi.mocked(socialMediaAccountRepository.findByOAuthState as any).mockResolvedValue(
        mockAccount as any
      );
      vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform as any).mockResolvedValue(
        mockIntegration as any
      );

      // First call succeeds (short-lived), second fails (long-lived)
      vi.mocked(httpClient.post).mockResolvedValueOnce(shortLivedResponse as any);
      vi.mocked(httpClient.post).mockRejectedValueOnce(new Error('API error'));
      vi.mocked(socialMediaAccountRepository.updateTokens as any).mockResolvedValue({} as any);

      // Should still succeed, using short-lived token as fallback
      const result = await service.handleOAuthCallback(
        platform as any,
        authCode,
        state,
        redirectUri
      );

      expect(result).toEqual({
        accountId: 'account-id',
        platform: 'facebook',
        connected: true,
        expiresAt: expect.any(String),
        pages: expect.any(Array),
      });

      // Should still update tokens (with short-lived as fallback)
      expect(socialMediaAccountRepository.updateTokens).toHaveBeenCalled();
    });

    it('should handle Facebook API errors', async () => {
      const mockIntegration = {
        userId,
        platform,
        appId: 'app-id-123',
        appSecretEnc: 'encrypted-secret',
      };

      const mockAccount = {
        id: 'account-id',
        userId,
        platform,
        oauthState: state,
      };

      vi.mocked(socialMediaAccountRepository.findByOAuthState as any).mockResolvedValue(
        mockAccount as any
      );
      vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform as any).mockResolvedValue(
        mockIntegration as any
      );

      // Mock Facebook returning an error
      vi.mocked(httpClient.post).mockRejectedValueOnce(new Error('Invalid authorization code'));

      await expect(
        service.handleOAuthCallback(platform as any, authCode, state, redirectUri)
      ).rejects.toThrow('Failed to exchange authorization code');

      // Verify tokens were not stored
      expect(socialMediaAccountRepository.updateTokens).not.toHaveBeenCalled();
    });
  });

  describe('Token Encryption', () => {
    it('should encrypt tokens before storing', async () => {
      // Tokens should be encrypted with AES-256-GCM
      // Stored values should not be plain text
      // Database should show hex-encoded encrypted values

      const mockIntegration = {
        userId,
        platform,
        appId: 'app-id',
        appSecretEnc: 'encrypted-secret',
      };

      const mockAccount = {
        id: 'account-id',
        userId,
        platform,
        oauthState: state,
      };

      vi.mocked(socialMediaAccountRepository.findByOAuthState as any).mockResolvedValue(
        mockAccount as any
      );
      vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform as any).mockResolvedValue(
        mockIntegration as any
      );
      vi.mocked(httpClient.post).mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'token', token_type: 'bearer', expires_in: 3600 },
        headers: {},
      } as any);

      await service.handleOAuthCallback(platform as any, authCode, state, redirectUri);

      // Verify tokens are encrypted (not plaintext)
      expect(socialMediaAccountRepository.updateTokens).toHaveBeenCalledWith(
        'account-id',
        expect.objectContaining({
          accessToken: expect.stringMatching(/^encrypted-/),
          shortLivedToken: expect.stringMatching(/^encrypted-/),
          longLivedToken: expect.stringMatching(/^encrypted-/),
        })
      );
    });
  });

  describe('Token Expiration Tracking', () => {
    it('should set correct expiration dates for both token types', async () => {
      const now = new Date();
      const mockIntegration = {
        userId,
        platform,
        appId: 'app-id',
        appSecretEnc: 'encrypted-secret',
      };

      const mockAccount = {
        id: 'account-id',
        userId,
        platform,
        oauthState: state,
      };

      vi.mocked(socialMediaAccountRepository.findByOAuthState as any).mockResolvedValue(
        mockAccount as any
      );
      vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform as any).mockResolvedValue(
        mockIntegration as any
      );
      vi.mocked(httpClient.post).mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'short', token_type: 'bearer', expires_in: 3600 },
        headers: {},
      } as any);
      vi.mocked(httpClient.post).mockResolvedValueOnce({
        status: 200,
        data: { access_token: 'long', token_type: 'bearer', expires_in: 5184000 },
        headers: {},
      } as any);

      await service.handleOAuthCallback(platform as any, authCode, state, redirectUri);

      const callArgs = (socialMediaAccountRepository.updateTokens as any).mock.calls[0][1];

      // Short-lived expires sooner
      expect(callArgs.shortLivedExpiresAt).toBeDefined();
      // Long-lived expires later
      expect(callArgs.longLivedExpiresAt).toBeDefined();
      // Long-lived should be significantly later
      const shortTime = callArgs.shortLivedExpiresAt.getTime();
      const longTime = callArgs.longLivedExpiresAt.getTime();
      expect(longTime).toBeGreaterThan(shortTime + 1000000); // At least 1000+ seconds later
    });
  });
});
