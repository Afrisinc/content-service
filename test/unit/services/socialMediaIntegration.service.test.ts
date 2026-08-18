import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialMediaIntegrationService } from '@/services/socialMediaIntegration.service';
import { socialMediaIntegrationRepository } from '@/repositories/socialMediaIntegration.repository';
import { socialMediaAccountRepository } from '@/repositories/socialMediaAccount.repository';
import { fetchFacebookPages, fetchInstagramBusinessAccount } from '@/utils/oauthToken';
import { isConnectionRecordPageId } from '@/utils/oauthConnectionRecord';

vi.mock('@/repositories/socialMediaIntegration.repository');
vi.mock('@/repositories/socialMediaAccount.repository');
vi.mock('@/utils/oauthToken', async importOriginal => {
  const actual = await importOriginal<typeof import('@/utils/oauthToken')>();
  return {
    ...actual,
    fetchFacebookPages: vi.fn(),
    fetchInstagramBusinessAccount: vi.fn(),
    encryptToken: (token: string) => `encrypted-${token}`,
  };
});
vi.mock('@/utils/crypto', () => ({
  encrypt: (text: string) => `encrypted-${text}`,
  decrypt: (text: string) => text.replace('encrypted-', ''),
}));

const userId = 'user-1';

const integration = {
  id: 'integration-1',
  userId,
  platform: 'instagram',
  appId: 'app-1',
  appSecretEnc: 'encrypted-secret',
  callbackUrl: 'https://example.test/callback',
  syncedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'account-1',
    userId,
    platform: 'instagram',
    pageId: 'page-1',
    pageName: 'Page One',
    meta: null,
    scopes: ['instagram_basic'],
    longLivedToken: null,
    oauthState: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('SocialMediaIntegrationService', () => {
  let service: SocialMediaIntegrationService;

  beforeEach(() => {
    service = new SocialMediaIntegrationService();
    vi.clearAllMocks();
    vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform).mockResolvedValue(
      integration as never
    );
    vi.mocked(socialMediaIntegrationRepository.findAllByUser).mockResolvedValue([
      integration,
    ] as never);
    vi.mocked(socialMediaIntegrationRepository.touchSynced).mockResolvedValue(undefined as never);
  });

  describe('addAccount', () => {
    it('creates the connection record under a namespaced page id, not a bare uuid', async () => {
      vi.mocked(socialMediaAccountRepository.create).mockImplementation(
        async data => accountRow(data as never) as never
      );

      await service.addAccount(userId, 'instagram', {
        name: 'Instagram',
        scopes: ['instagram_basic'],
      });

      const created = vi.mocked(socialMediaAccountRepository.create).mock.calls[0][0];
      expect(isConnectionRecordPageId(created.pageId)).toBe(true);
      expect(created.pageName).toBe('Instagram');
      expect(created.oauthState).toEqual(expect.any(String));
    });

    it('returns the oauth state so the caller can build the authorize url', async () => {
      vi.mocked(socialMediaAccountRepository.create).mockImplementation(
        async data => accountRow(data as never) as never
      );

      const result = await service.addAccount(userId, 'instagram', {
        name: 'Instagram',
        scopes: ['instagram_basic'],
      });

      const created = vi.mocked(socialMediaAccountRepository.create).mock.calls[0][0];
      expect(result.oauthState).toBe(created.oauthState);
    });

    it('leaves the page id bare on platforms that have no page-selection step', async () => {
      vi.mocked(socialMediaAccountRepository.create).mockImplementation(
        async data => accountRow(data as never) as never
      );

      await service.addAccount(userId, 'linkedin', {
        name: 'LinkedIn',
        scopes: ['w_member_social'],
      });

      const created = vi.mocked(socialMediaAccountRepository.create).mock.calls[0][0];
      expect(isConnectionRecordPageId(created.pageId)).toBe(false);
    });

    it('rejects when the platform has no saved credentials', async () => {
      vi.mocked(socialMediaIntegrationRepository.findByUserAndPlatform).mockResolvedValue(
        null as never
      );

      await expect(
        service.addAccount(userId, 'instagram', { name: 'Instagram', scopes: [] })
      ).rejects.toThrow('Save instagram app credentials before adding an account');
      expect(socialMediaAccountRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('listIntegrations', () => {
    it('hides the oauth connection record from the connected pages list', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([
        accountRow({
          id: 'connection-row',
          pageId: 'oauth:11111111-1111-1111-1111-111111111111',
          pageName: 'Instagram',
          longLivedToken: 'encrypted-user-token',
        }),
        accountRow({ id: 'page-row', pageId: '17841400000000000', pageName: '@afrisinc_inc' }),
      ] as never);

      const [instagram] = (await service.listIntegrations(userId)).filter(
        row => row.platform === 'instagram'
      );

      expect(instagram.accounts).toHaveLength(1);
      expect(instagram.accounts[0].name).toBe('@afrisinc_inc');
    });

    it('still reports connected while only the oauth connection record exists', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([
        accountRow({
          pageId: 'oauth:11111111-1111-1111-1111-111111111111',
          pageName: 'Instagram',
          longLivedToken: 'encrypted-user-token',
        }),
      ] as never);

      const [instagram] = (await service.listIntegrations(userId)).filter(
        row => row.platform === 'instagram'
      );

      expect(instagram.accounts).toHaveLength(0);
      expect(instagram.connected).toBe(true);
    });

    it('keeps showing the account on platforms that have no page-selection step', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([
        accountRow({
          platform: 'linkedin',
          pageId: '22222222-2222-2222-2222-222222222222',
          pageName: 'LinkedIn',
          longLivedToken: null,
        }),
      ] as never);

      const [linkedin] = (await service.listIntegrations(userId)).filter(
        row => row.platform === 'linkedin'
      );

      expect(linkedin.accounts).toHaveLength(1);
      expect(linkedin.connected).toBe(true);
    });

    it('reports disconnected when the platform has no accounts at all', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([] as never);

      const [instagram] = (await service.listIntegrations(userId)).filter(
        row => row.platform === 'instagram'
      );

      expect(instagram.connected).toBe(false);
    });

    it('reports disconnected when the connection record holds no token', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([
        accountRow({
          pageId: 'oauth:11111111-1111-1111-1111-111111111111',
          pageName: 'Instagram',
          longLivedToken: null,
        }),
      ] as never);

      const [instagram] = (await service.listIntegrations(userId)).filter(
        row => row.platform === 'instagram'
      );

      expect(instagram.connected).toBe(false);
    });
  });

  describe('getAvailablePages', () => {
    const facebookPage = {
      id: '1234567890',
      name: 'Afrisinc',
      category: 'Company',
      access_token: 'page-token',
    };

    it('uses the user token from the connection record, not a page token', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([
        accountRow({
          id: 'page-row',
          pageId: '17841400000000000',
          longLivedToken: 'encrypted-page-token',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
        }),
        accountRow({
          id: 'connection-row',
          pageId: 'oauth:11111111-1111-1111-1111-111111111111',
          longLivedToken: 'encrypted-user-token',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ] as never);
      vi.mocked(fetchFacebookPages).mockResolvedValue([facebookPage] as never);
      vi.mocked(fetchInstagramBusinessAccount).mockResolvedValue({
        id: '17841400000000000',
        username: 'afrisinc_inc',
      } as never);

      await service.getAvailablePages(userId, 'instagram');

      expect(fetchFacebookPages).toHaveBeenCalledWith('user-token');
    });

    it('treats an instagram page as connected by its ig user id', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([
        accountRow({
          pageId: 'oauth:11111111-1111-1111-1111-111111111111',
          longLivedToken: 'encrypted-user-token',
        }),
        accountRow({ id: 'page-row', pageId: '17841400000000000' }),
      ] as never);
      vi.mocked(fetchFacebookPages).mockResolvedValue([facebookPage] as never);
      vi.mocked(fetchInstagramBusinessAccount).mockResolvedValue({
        id: '17841400000000000',
        username: 'afrisinc_inc',
      } as never);

      const result = await service.getAvailablePages(userId, 'instagram');

      expect(result.available).toHaveLength(0);
      expect(result.connected).toHaveLength(1);
      expect(result.connected[0].name).toBe('@afrisinc_inc');
    });

    it('serves the stored accounts when no account carries a usable token', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([
        accountRow({ pageId: '17841400000000000', pageName: '@afrisinc_inc', longLivedToken: null }),
      ] as never);

      const result = await service.getAvailablePages(userId, 'instagram');

      expect(fetchFacebookPages).not.toHaveBeenCalled();
      expect(result.available).toEqual([]);
      expect(result.connected).toEqual([
        {
          id: '17841400000000000',
          name: '@afrisinc_inc',
          instagramBusinessAccount: { id: '17841400000000000', username: 'afrisinc_inc' },
        },
      ]);
    });

    it('returns empty lists when nothing is connected yet', async () => {
      vi.mocked(socialMediaAccountRepository.findAllByUser).mockResolvedValue([] as never);

      await expect(service.getAvailablePages(userId, 'instagram')).resolves.toEqual({
        available: [],
        connected: [],
      });
    });
  });

  describe('addAccountFromFacebookPage', () => {
    const page = {
      id: '1234567890',
      name: 'Afrisinc',
      category: 'Company',
      access_token: 'page-token',
    };

    it('stores the instagram user id and handle rather than the page id', async () => {
      vi.mocked(fetchInstagramBusinessAccount).mockResolvedValue({
        id: '17841400000000000',
        username: 'afrisinc_inc',
      } as never);
      vi.mocked(socialMediaAccountRepository.create).mockImplementation(
        async data => accountRow(data as never) as never
      );

      await service.addAccountFromFacebookPage(
        userId,
        'instagram',
        page.id,
        page as never,
        ['instagram_basic'],
        'page-token'
      );

      const created = vi.mocked(socialMediaAccountRepository.create).mock.calls[0][0];
      expect(created.pageId).toBe('17841400000000000');
      expect(created.pageName).toBe('@afrisinc_inc');
      expect(created.meta).toBe('Afrisinc');
    });

    it('keeps the facebook page id for facebook pages', async () => {
      vi.mocked(socialMediaAccountRepository.create).mockImplementation(
        async data => accountRow(data as never) as never
      );

      await service.addAccountFromFacebookPage(
        userId,
        'facebook',
        page.id,
        page as never,
        ['pages_manage_posts'],
        'page-token'
      );

      const created = vi.mocked(socialMediaAccountRepository.create).mock.calls[0][0];
      expect(created.pageId).toBe('1234567890');
      expect(created.pageName).toBe('Afrisinc');
    });

    it('rejects a page with no linked instagram professional account', async () => {
      vi.mocked(fetchInstagramBusinessAccount).mockResolvedValue(null as never);

      await expect(
        service.addAccountFromFacebookPage(
          userId,
          'instagram',
          page.id,
          page as never,
          ['instagram_basic'],
          'page-token'
        )
      ).rejects.toThrow('has no linked Instagram professional account');
      expect(socialMediaAccountRepository.create).not.toHaveBeenCalled();
    });
  });
});
