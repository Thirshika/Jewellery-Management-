CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Jewellery Workspace',
  is_legacy BOOLEAN NOT NULL DEFAULT FALSE,
  legacy_claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_single_legacy_idx
  ON workspaces (is_legacy)
  WHERE is_legacy;

INSERT INTO workspaces (name, is_legacy)
SELECT 'Existing Jewellery Workspace', TRUE
WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE is_legacy);

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);

INSERT INTO workspaces (id, name)
SELECT id, 'Jewellery Workspace'
FROM user_accounts
WHERE workspace_id IS NULL
  AND id <> COALESCE(
    (SELECT id FROM user_accounts ORDER BY created_at, id LIMIT 1),
    '00000000-0000-0000-0000-000000000000'::UUID
  )
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  legacy_id UUID;
  first_account_id UUID;
BEGIN
  SELECT id INTO legacy_id FROM workspaces WHERE is_legacy LIMIT 1;
  SELECT id INTO first_account_id FROM user_accounts ORDER BY created_at, id LIMIT 1;

  IF first_account_id IS NOT NULL THEN
    UPDATE user_accounts SET workspace_id = legacy_id
    WHERE id = first_account_id AND workspace_id IS NULL;
    UPDATE workspaces SET legacy_claimed_at = COALESCE(legacy_claimed_at, NOW())
    WHERE id = legacy_id;
  END IF;

  UPDATE user_accounts SET workspace_id = id WHERE workspace_id IS NULL;
END
$$;

ALTER TABLE user_accounts
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_accounts_workspace_id_idx
  ON user_accounts (workspace_id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
UPDATE orders
SET workspace_id = (SELECT id FROM workspaces WHERE is_legacy LIMIT 1)
WHERE workspace_id IS NULL;
ALTER TABLE orders
  ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS orders_workspace_deadline_status_idx
  ON orders (workspace_id, delivery_deadline, status);

ALTER TABLE saved_bills
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
UPDATE saved_bills
SET workspace_id = (SELECT id FROM workspaces WHERE is_legacy LIMIT 1)
WHERE workspace_id IS NULL;
ALTER TABLE saved_bills
  ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS saved_bills_workspace_date_created_idx
  ON saved_bills (workspace_id, bill_date DESC, created_at DESC);

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);
UPDATE push_subscriptions
SET workspace_id = (SELECT id FROM workspaces WHERE is_legacy LIMIT 1)
WHERE workspace_id IS NULL;
ALTER TABLE push_subscriptions
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key;
DROP INDEX IF EXISTS push_subscriptions_endpoint_key;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_workspace_endpoint_idx
  ON push_subscriptions (workspace_id, endpoint);
