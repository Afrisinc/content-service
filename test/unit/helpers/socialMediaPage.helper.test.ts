import { describe, expect, it } from 'vitest';
import { buildConnectedPagesFromAccounts } from '@/helpers/socialMediaPage.helper';
import type { SocialMediaAccount } from '@prisma/client';

function account(overrides: Partial<SocialMediaAccount>): SocialMediaAccount {
  return {
    id: 'account-1',
    userId: 'user-1',
    platform: 'facebook',
    pageId: '1234567890',
    pageName: 'Afrisinc',
    meta: 'Media/News Company',
    ...overrides,
  } as SocialMediaAccount;
}

describe('buildConnectedPagesFromAccounts', () => {
  it('maps a stored facebook page onto the shape the picker renders', () => {
    const pages = buildConnectedPagesFromAccounts([account({})], 'facebook');

    expect(pages).toEqual([
      { id: '1234567890', name: 'Afrisinc', category: 'Media/News Company' },
    ]);
  });

  it('never exposes a token from the stored row', () => {
    const pages = buildConnectedPagesFromAccounts(
      [account({ accessToken: 'encrypted', longLivedToken: 'encrypted' })],
      'facebook'
    );

    expect(pages[0]).not.toHaveProperty('access_token');
  });

  it('addresses instagram entries by the stored IG user id', () => {
    const pages = buildConnectedPagesFromAccounts(
      [
        account({
          platform: 'instagram',
          pageId: '17841400000000000',
          pageName: '@afrisinc_inc',
          meta: 'Afrisinc',
        }),
      ],
      'instagram'
    );

    expect(pages).toEqual([
      {
        id: '17841400000000000',
        name: '@afrisinc_inc',
        instagramBusinessAccount: { id: '17841400000000000', username: 'afrisinc_inc' },
      },
    ]);
  });

  it('drops OAuth connection records and rows from other platforms', () => {
    const pages = buildConnectedPagesFromAccounts(
      [
        account({ id: 'connection', pageId: 'oauth:11111111-1111-1111-1111-111111111111' }),
        account({ id: 'other-platform', platform: 'linkedin' }),
        account({ id: 'real', pageId: '999' }),
      ],
      'facebook'
    );

    expect(pages).toEqual([{ id: '999', name: 'Afrisinc', category: 'Media/News Company' }]);
  });

  it('falls back to the page id when no name was stored', () => {
    const pages = buildConnectedPagesFromAccounts([account({ pageName: null, meta: null })], 'facebook');

    expect(pages[0]).toEqual({ id: '1234567890', name: '1234567890', category: undefined });
  });
});
