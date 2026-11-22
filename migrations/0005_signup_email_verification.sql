ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "requiresEmailVerification" boolean NOT NULL DEFAULT false;
