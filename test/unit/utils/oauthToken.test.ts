import * as crypto from '@/utils/crypto';
import {
  calculateExpiresAt,
  decryptToken,
  encryptToken,
  exchangeAuthCodeForToken,
  exchangeShortForLongLived,
  isTokenExpired,
  isTokenExpiringSoon,
} from '@/utils/oauthToken';
import { httpClient } from '@/config/http-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/http-client');
vi.mock('@/utils/crypto');

describe('OAuth Token Utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exchangeAuthCodeForToken', () => {
    it('should exchange auth code for access token', async () => {
      const mockResponse = {
        data: {
          access_token: 'test-token',
          token_type: 'bearer',
          expires_in: 3600,
        },
      };

      vi.spyOn(httpClient, 'post').mockResolvedValue(mockResponse);

      const result = await exchangeAuthCodeForToken(
        'facebook',
        'auth-code',
        'app-id',
        'app-secret',
        'http://localhost/callback'
      );

      expect(result).toEqual({
        access_token: 'test-token',
        token_type: 'bearer',
        expires_in: 3600,
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        'https://graph.instagram.com/v18.0/oauth/access_token',
        expect.objectContaining({
          client_id: 'app-id',
          client_secret: 'app-secret',
          grant_type: 'authorization_code',
          redirect_uri: 'http://localhost/callback',
          code: 'auth-code',
        })
      );
    });

    it('should throw error for unsupported platform', async () => {
      await expect(exchangeAuthCodeForToken('unsupported' as any, 'code', 'id', 'secret', 'uri')).rejects.toThrow(
        'OAuth endpoint not configured for platform'
      );
    });

    it('should throw error if token exchange fails', async () => {
      vi.spyOn(httpClient, 'post').mockRejectedValue(new Error('Network error'));

      await expect(exchangeAuthCodeForToken('facebook', 'code', 'id', 'secret', 'uri')).rejects.toThrow(
        'Failed to exchange authorization code'
      );
    });
  });

  describe('exchangeShortForLongLived', () => {
    it('should exchange short-lived token for long-lived token', async () => {
      const mockResponse = {
        data: {
          access_token: 'long-lived-token',
          token_type: 'bearer',
          expires_in: 5184000,
        },
      };

      vi.spyOn(httpClient, 'post').mockResolvedValue(mockResponse);

      const result = await exchangeShortForLongLived('facebook', 'short-lived-token', 'app-id', 'app-secret');

      expect(result).toEqual({
        access_token: 'long-lived-token',
        token_type: 'bearer',
        expires_in: 5184000,
      });

      expect(httpClient.post).toHaveBeenCalledWith(
        'https://graph.instagram.com/v18.0/oauth/access_token',
        expect.objectContaining({
          client_id: 'app-id',
          client_secret: 'app-secret',
          grant_type: 'fb_exchange_token',
          fb_exchange_token: 'short-lived-token',
        })
      );
    });

    it('should throw error for unsupported platform', async () => {
      await expect(exchangeShortForLongLived('twitter' as any, 'token', 'id', 'secret')).rejects.toThrow(
        'Long-lived token exchange not supported'
      );
    });

    it('should throw error if exchange fails', async () => {
      vi.spyOn(httpClient, 'post').mockRejectedValue(new Error('API error'));

      await expect(exchangeShortForLongLived('instagram', 'token', 'id', 'secret')).rejects.toThrow(
        'Failed to exchange for long-lived token'
      );
    });
  });

  describe('encryptToken / decryptToken', () => {
    it('should encrypt and decrypt token correctly', () => {
      const token = 'test-token-secret';
      const encrypted = 'encrypted-value';

      vi.spyOn(crypto, 'encrypt').mockReturnValue(encrypted);
      vi.spyOn(crypto, 'decrypt').mockReturnValue(token);

      const encryptedToken = encryptToken(token);
      expect(encryptedToken).toBe(encrypted);

      const decryptedToken = decryptToken(encrypted);
      expect(decryptedToken).toBe(token);

      expect(crypto.encrypt).toHaveBeenCalledWith(token);
      expect(crypto.decrypt).toHaveBeenCalledWith(encrypted);
    });
  });

  describe('calculateExpiresAt', () => {
    it('should calculate expiration date correctly', () => {
      const now = Date.now();
      const expiresInSeconds = 3600;

      const expiresAt = calculateExpiresAt(expiresInSeconds);

      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(now + expiresInSeconds * 1000 - 1000);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(now + expiresInSeconds * 1000 + 1000);
    });
  });

  describe('isTokenExpired', () => {
    it('should return true if token is expired', () => {
      const expiredDate = new Date(Date.now() - 3600 * 1000);
      expect(isTokenExpired(expiredDate)).toBe(true);
    });

    it('should return false if token is not expired', () => {
      const futureDate = new Date(Date.now() + 3600 * 1000);
      expect(isTokenExpired(futureDate)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isTokenExpired(null)).toBe(false);
      expect(isTokenExpired(undefined)).toBe(false);
    });
  });

  describe('isTokenExpiringSoon', () => {
    it('should return true if token is expiring within buffer', () => {
      const soonDate = new Date(Date.now() + 1800 * 1000);
      expect(isTokenExpiringSoon(soonDate, 3600)).toBe(true);
    });

    it('should return false if token is not expiring soon', () => {
      const futureDate = new Date(Date.now() + 7200 * 1000);
      expect(isTokenExpiringSoon(futureDate, 3600)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isTokenExpiringSoon(null, 3600)).toBe(false);
      expect(isTokenExpiringSoon(undefined, 3600)).toBe(false);
    });
  });
});
