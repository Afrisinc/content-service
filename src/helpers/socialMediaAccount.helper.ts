/** Every publish path resolves its token-bearing account here, so no caller picks the wrong one. */

import { SocialMediaAccount } from '@prisma/client';
import { isConnectionRecordPageId } from '@/utils/oauthConnectionRecord';

/**
 * `pageId` decides the match, not `platform` alone: a user with several Pages on
 * one platform has one row per Page, each holding that Page's own token, and the
 * repository returns them unordered. Matching on platform alone therefore picks
 * an arbitrary Page's token — or the OAuth connection record's user token, which
 * cannot publish at all.
 */
export function selectPublishingAccount(
  accounts: SocialMediaAccount[],
  platform: string,
  pageId: string
): SocialMediaAccount | undefined {
  const publishable = accounts.filter(
    account =>
      account.platform === platform &&
      !!account.accessToken &&
      !isConnectionRecordPageId(account.pageId)
  );

  return publishable.find(account => account.pageId === pageId) ?? publishable[0];
}
