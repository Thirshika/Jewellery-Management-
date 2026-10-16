ALTER TABLE user_accounts
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_phone_idx
  ON user_accounts (phone)
  WHERE phone IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_accounts_contact_required_check'
      AND conrelid = 'public.user_accounts'::regclass
  ) THEN
    ALTER TABLE user_accounts
      ADD CONSTRAINT user_accounts_contact_required_check
      CHECK (email IS NOT NULL OR phone IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_accounts_phone_format_check'
      AND conrelid = 'public.user_accounts'::regclass
  ) THEN
    ALTER TABLE user_accounts
      ADD CONSTRAINT user_accounts_phone_format_check
      CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{6,14}$');
  END IF;
END
$$;
