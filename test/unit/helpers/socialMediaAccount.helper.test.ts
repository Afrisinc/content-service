import { describe, expect, it } from 'vitest';
import { selectPublishingAccount } from '@/helpers/socialMediaAccount.helper';
import type { SocialMediaAccount } from '@prisma/client';

function account(overrides: Partial<SocialMediaAccount>): SocialMediaAccount {
  return {
    id: 'account-1',
    userId: 'user-1',
    platform: 'instagram',
    pageId: '17841400000000000',
    pageName: '@afrisinc_inc',
    accessToken: 'encrypted-page-token',
    ...overrides,
  } as SocialMediaAccount;
}

const connectionRecord = account({
  id: 'connection-row',
  pageId: 'oauth:11111111-1111-1111-1111-111111111111',
  pageName: 'Instagram',
  accessToken: 'encrypted-user-token',
});

describe('selectPublishingAccount', () => {
  it('never returns the oauth connection record', () => {
    const result = selectPublishingAccount([connectionRecord], 'instagram', '17841400000000000');

    expect(result).toBeUndefined();
  });

  it('matches the account that owns the page being published to', () => {
    const other = account({ id: 'other-row', pageId: '17841499999999999' });
    const target = account({ id: 'target-row', pageId: '17841400000000000' });

    const result = selectPublishingAccount(
      [connectionRecord, other, target],
      'instagram',
      '17841400000000000'
    );

    expect(result?.id).toBe('target-row');
  });

  it('falls back to another page on the platform when the page id has no row', () => {
    const other = account({ id: 'other-row', pageId: '17841499999999999' });

    const result = selectPublishingAccount([connectionRecord, other], 'instagram', 'unknown-page');

    expect(result?.id).toBe('other-row');
  });

  it('ignores accounts on other platforms', () => {
    const facebook = account({ id: 'facebook-row', platform: 'facebook', pageId: '123' });

    const result = selectPublishingAccount([facebook], 'instagram', '123');

    expect(result).toBeUndefined();
  });

  it('ignores accounts with no stored token', () => {
    const tokenless = account({ id: 'tokenless-row', accessToken: null });

    const result = selectPublishingAccount([tokenless], 'instagram', '17841400000000000');

    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty account list', () => {
    expect(selectPublishingAccount([], 'instagram', '17841400000000000')).toBeUndefined();
  });
});
