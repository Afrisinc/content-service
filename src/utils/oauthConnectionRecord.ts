import { randomUUID } from 'node:crypto';

/**
 * The OAuth handshake needs somewhere to hold the state token and, afterwards, the
 * user access token — before any Page has been chosen. That lives in a
 * social_media_accounts row whose pageId carries this prefix, so it can be told
 * apart from a row that represents a real Page or Instagram account.
 */
const CONNECTION_RECORD_PREFIX = 'oauth:';

export function buildConnectionRecordPageId(): string {
  return `${CONNECTION_RECORD_PREFIX}${randomUUID()}`;
}

export function isConnectionRecordPageId(pageId: string): boolean {
  return pageId.startsWith(CONNECTION_RECORD_PREFIX);
}

/**
 * Only the Meta platforms have a page-selection step that turns the handshake into
 * real account rows. Everywhere else the row created for the handshake stays the
 * account itself, so marking it as a connection record would hide it from callers.
 */
export function platformUsesConnectionRecord(platform: string): boolean {
  return platform === 'facebook' || platform === 'instagram';
}
