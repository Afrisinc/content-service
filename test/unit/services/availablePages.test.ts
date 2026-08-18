import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialMediaIntegrationService } from '@/services/socialMediaIntegration.service';
import { socialMediaIntegrationRepository } from '@/repositories/socialMediaIntegration.repository';
import { socialMediaAccountRepository } from '@/repositories/socialMediaAccount.repository';
import { fetchFacebookPages, fetchInstagramBusinessAccount } from '@/utils/oauthToken';
import { cacheDelete, cacheGet, cacheSet } from '@/utils/cache';
import { decrypt, encrypt } from '@/utils/crypto';

vi.mock('@/repositories/socialMediaIntegration.repository');
vi.mock('@/repositories/socialMediaAccount.repository');
vi.mock('@/utils/cache');
vi.mock('@/utils/oauthToken', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/oauthToken')>();
  return {
    ...actual,
    fetchFacebookPages: vi.fn(),
    fetchInstagramBusinessAccount: vi.fn(),
  };
});
vi.mock('@/utils/crypto', () => ({
  encrypt: vi.fn((value: string) => `enc(${value})`),
  decrypt: vi.fn((value: string) => value.replace(/^enc\((.*)\)$/, '$1')),
}));

const service = new SocialMediaIntegrationService();

const connectionRecord = {
  id: 'connection-row',
  userId: 'user-1',
  platform: 'facebook',
  pageId: 'oauth:11111111-1111-1111-1111-111111111111',
  pageName: 'Facebook',
  meta: null,
  longLivedToken: 'enc(user-token)',
};

const storedPage = {
  id: 'account-1',
  userId: 'user-1',
  platform: 'facebook',
  pageId: '1234567890',
  pageName: 'Afrisinc',
  meta: 'Media/News Company',
  longLivedToken: 'enc(page-token)',
};

const metaPage = {
  id: '1234567890',
  name: 'Afrisinc',
  access_token: 'page-token',
  category: 'Media/News Company',
};

function accounts(rows: Record<string, unknown>[]) {
  vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue(rows as never);
}

describe('getAvailablePages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform).mockResolvedValue({
      id: 'integration-1',
      appId: 'app-1',
    } as never);
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(cacheSet).mockResolvedValue(undefined);
    vi.mocked(cacheDelete).mockResolvedValue(undefined);
  });

  it('rejects a platform whose app credentials were never saved', async () => {
    vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform).mockResolvedValue(null);

    await expect(service.getAvailablePages('user-1', 'facebook')).rejects.toThrow(
      'Save facebook app credentials first'
    );
    expect(fetchFacebookPages).not.toHaveBeenCalled();
  });

  it('returns empty lists when the user has no account rows', async () => {
    accounts([]);

    await expect(service.getAvailablePages('user-1', 'facebook')).resolves.toEqual({
      available: [],
      connected: [],
    });
    expect(cacheGet).not.toHaveBeenCalled();
  });

  it('serves cached pages without calling Facebook', async () => {
    accounts([connectionRecord, storedPage]);
    vi.mocked(cacheGet).mockResolvedValue(`enc(${JSON.stringify([metaPage])})`);

    const result = await service.getAvailablePages('user-1', 'facebook');

    expect(fetchFacebookPages).not.toHaveBeenCalled();
    expect(result.connected).toEqual([metaPage]);
    expect(result.available).toEqual([]);
  });

  it('caches the page list it fetched, keyed per user and platform, and encrypted', async () => {
    accounts([connectionRecord, storedPage]);
    vi.mocked(fetchFacebookPages).mockResolvedValue([metaPage]);

    await service.getAvailablePages('user-1', 'facebook');

    expect(fetchFacebookPages).toHaveBeenCalledWith('user-token');
    expect(encrypt).toHaveBeenCalledWith(JSON.stringify([metaPage]));
    expect(cacheSet).toHaveBeenCalledWith(
      'social:pages:facebook:user-1',
      `enc(${JSON.stringify([metaPage])})`,
      expect.any(Number)
    );
  });

  it('splits fetched pages into connected and available by what the database holds', async () => {
    const unconnected = { id: '999', name: 'Second Page', access_token: 'other-token' };
    accounts([connectionRecord, storedPage]);
    vi.mocked(fetchFacebookPages).mockResolvedValue([metaPage, unconnected]);

    const result = await service.getAvailablePages('user-1', 'facebook');

    expect(result.connected).toEqual([metaPage]);
    expect(result.available).toEqual([unconnected]);
  });

  it('falls back to the stored accounts when Facebook rejects the call', async () => {
    accounts([connectionRecord, storedPage]);
    vi.mocked(fetchFacebookPages).mockRejectedValue(new Error('Invalid OAuth access token'));

    const result = await service.getAvailablePages('user-1', 'facebook');

    expect(result).toEqual({
      available: [],
      connected: [{ id: '1234567890', name: 'Afrisinc', category: 'Media/News Company' }],
    });
    expect(cacheSet).not.toHaveBeenCalled();
  });

  it('falls back to the stored accounts when no row carries a usable token', async () => {
    accounts([{ ...storedPage, longLivedToken: null }]);

    const result = await service.getAvailablePages('user-1', 'facebook');

    expect(fetchFacebookPages).not.toHaveBeenCalled();
    expect(result.connected).toHaveLength(1);
    expect(result.available).toEqual([]);
  });

  it('falls back to the stored accounts when the token cannot be decrypted', async () => {
    accounts([connectionRecord, storedPage]);
    vi.mocked(decrypt).mockImplementation(() => {
      throw new Error('Invalid encrypted payload format');
    });

    const result = await service.getAvailablePages('user-1', 'facebook');

    expect(result.connected).toHaveLength(1);
    expect(result.available).toEqual([]);
  });

  it('drops an unreadable cache entry and refetches instead of failing', async () => {
    accounts([connectionRecord, storedPage]);
    vi.mocked(cacheGet).mockResolvedValue('not-decryptable');
    vi.mocked(decrypt).mockImplementation((value: string) => {
      if (value === 'not-decryptable') {
        throw new Error('Invalid encrypted payload format');
      }
      return value.replace(/^enc\((.*)\)$/, '$1');
    });
    vi.mocked(fetchFacebookPages).mockResolvedValue([metaPage]);

    const result = await service.getAvailablePages('user-1', 'facebook');

    expect(cacheDelete).toHaveBeenCalledWith('social:pages:facebook:user-1');
    expect(fetchFacebookPages).toHaveBeenCalled();
    expect(result.connected).toEqual([metaPage]);
  });

  it('matches instagram entries on the IG user id, not the page id', async () => {
    accounts([
      { ...connectionRecord, platform: 'instagram' },
      {
        ...storedPage,
        platform: 'instagram',
        pageId: '17841400000000000',
        pageName: '@afrisinc_inc',
        meta: 'Afrisinc',
      },
    ]);
    vi.mocked(fetchFacebookPages).mockResolvedValue([metaPage]);
    vi.mocked(fetchInstagramBusinessAccount).mockResolvedValue({
      id: '17841400000000000',
      username: 'afrisinc_inc',
    });

    const result = await service.getAvailablePages('user-1', 'instagram');

    expect(result.available).toEqual([]);
    expect(result.connected).toHaveLength(1);
    expect(result.connected[0].id).toBe('17841400000000000');
  });

  it('serves stored instagram accounts when the graph lookup fails', async () => {
    accounts([
      { ...connectionRecord, platform: 'instagram' },
      {
        ...storedPage,
        platform: 'instagram',
        pageId: '17841400000000000',
        pageName: '@afrisinc_inc',
        meta: 'Afrisinc',
      },
    ]);
    vi.mocked(fetchFacebookPages).mockRejectedValue(new Error('Application request limit reached'));

    const result = await service.getAvailablePages('user-1', 'instagram');

    expect(result.connected).toEqual([
      {
        id: '17841400000000000',
        name: '@afrisinc_inc',
        instagramBusinessAccount: { id: '17841400000000000', username: 'afrisinc_inc' },
      },
    ]);
  });
});

describe('invalidatePagesCache', () => {
  it('clears the entry for that user and platform only', async () => {
    vi.mocked(cacheDelete).mockResolvedValue(undefined);

    await service.invalidatePagesCache('user-1', 'instagram');

    expect(cacheDelete).toHaveBeenCalledWith('social:pages:instagram:user-1');
  });
});
