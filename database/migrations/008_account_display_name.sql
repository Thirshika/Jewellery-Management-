ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_accounts_display_name_check'
      AND conrelid = 'public.user_accounts'::regclass
  ) THEN
    ALTER TABLE user_accounts
      ADD CONSTRAINT user_accounts_display_name_check
      CHECK (
        display_name = btrim(display_name)
        AND char_length(display_name) <= 80
      );
  END IF;
END
$$;
