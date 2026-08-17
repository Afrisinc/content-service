-- Add OAuth token management fields to SocialMediaAccount
ALTER TABLE "social_media_accounts" ADD COLUMN "short_lived_token" TEXT;
ALTER TABLE "social_media_accounts" ADD COLUMN "short_lived_expires_at" TIMESTAMPTZ;
ALTER TABLE "social_media_accounts" ADD COLUMN "long_lived_token" TEXT;
ALTER TABLE "social_media_accounts" ADD COLUMN "long_lived_expires_at" TIMESTAMPTZ;
ALTER TABLE "social_media_accounts" ADD COLUMN "token_type" VARCHAR(50) NOT NULL DEFAULT 'long-lived';
ALTER TABLE "social_media_accounts" ADD COLUMN "oauth_state" VARCHAR(255);

-- Migrate existing accessToken to longLivedToken
UPDATE "social_media_accounts"
SET "long_lived_token" = "accessToken",
    "long_lived_expires_at" = "expiresAt"
WHERE "accessToken" IS NOT NULL;

-- Keep accessToken for backward compatibility, rename expiresAt
ALTER TABLE "social_media_accounts" RENAME COLUMN "expiresAt" TO "token_expires_at";
