-- Baseline auth persistence shape for the current in-memory user model.
CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "email_verified_at" DATETIME,
  "display_name" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "preferences" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" DATETIME NOT NULL,
  "used_at" DATETIME,
  "created_at" DATETIME NOT NULL,
  CONSTRAINT "email_verification_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_verification_tokens_token_hash_key"
  ON "email_verification_tokens"("token_hash");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_user_id_idx"
  ON "email_verification_tokens"("user_id");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_expires_at_idx"
  ON "email_verification_tokens"("expires_at");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_used_at_idx"
  ON "email_verification_tokens"("used_at");

CREATE TABLE IF NOT EXISTS "mailing_list_subscriptions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "user_id" TEXT,
  "status" TEXT NOT NULL,
  "consent_source" TEXT NOT NULL,
  "consent_text_version" TEXT NOT NULL,
  "consented_at" DATETIME,
  "unsubscribed_at" DATETIME,
  "created_at" DATETIME NOT NULL,
  "updated_at" DATETIME NOT NULL,
  CONSTRAINT "mailing_list_subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "mailing_list_subscriptions_status_check"
    CHECK ("status" IN ('pending', 'subscribed', 'unsubscribed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "mailing_list_subscriptions_email_key"
  ON "mailing_list_subscriptions"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "mailing_list_subscriptions_user_id_key"
  ON "mailing_list_subscriptions"("user_id")
  WHERE "user_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "mailing_list_subscriptions_status_idx"
  ON "mailing_list_subscriptions"("status");
CREATE INDEX IF NOT EXISTS "mailing_list_subscriptions_updated_at_idx"
  ON "mailing_list_subscriptions"("updated_at");
