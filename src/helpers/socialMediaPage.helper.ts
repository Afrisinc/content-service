import { SocialMediaAccount } from '@prisma/client';
import { isConnectionRecordPageId } from '@/utils/oauthConnectionRecord';
import type { FacebookPage } from '@/utils/oauthToken';

export function buildConnectedPagesFromAccounts(
  accounts: SocialMediaAccount[],
  platform: string
): FacebookPage[] {
  return accounts
    .filter(account => account.platform === platform && !isConnectionRecordPageId(account.pageId))
    .map(account => {
      const name = account.pageName ?? account.pageId;

      if (platform !== 'instagram') {
        return {
          id: account.pageId,
          name,
          category: account.meta ?? undefined,
        };
      }

      return {
        id: account.pageId,
        name,
        instagramBusinessAccount: {
          id: account.pageId,
          username: name.replace(/^@/, ''),
        },
      };
    });
}
