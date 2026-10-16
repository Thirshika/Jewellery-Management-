CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid(),
  customer_name TEXT,
  jewellery_name TEXT,
  advance_amount NUMERIC(12, 2),
  order_date DATE,
  delivery_deadline DATE,
  additional_notes TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS jewellery_name TEXT,
  ADD COLUMN IF NOT EXISTS advance_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_deadline DATE,
  ADD COLUMN IF NOT EXISTS additional_notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE orders
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN additional_notes SET DEFAULT '',
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN customer_name SET NOT NULL,
  ALTER COLUMN jewellery_name SET NOT NULL,
  ALTER COLUMN advance_amount SET NOT NULL,
  ALTER COLUMN order_date SET NOT NULL,
  ALTER COLUMN delivery_deadline SET NOT NULL,
  ALTER COLUMN additional_notes SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'orders'::regclass
      AND c.contype = 'p'
      AND cardinality(c.conkey) = 1
      AND a.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'The existing orders table has a primary key other than orders.id; review the schema before migrating.';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_customer_name_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_customer_name_check
      CHECK (length(trim(customer_name)) BETWEEN 1 AND 160) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_jewellery_name_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_jewellery_name_check
      CHECK (length(trim(jewellery_name)) BETWEEN 1 AND 160) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_advance_amount_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_advance_amount_check
      CHECK (advance_amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_delivery_deadline_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_delivery_deadline_check
      CHECK (delivery_deadline >= order_date) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_additional_notes_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_additional_notes_check
      CHECK (length(additional_notes) <= 5000) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'orders'::regclass AND conname = 'orders_status_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('pending', 'completed')) NOT VALID;
  END IF;
END
$$;

ALTER TABLE orders
  VALIDATE CONSTRAINT orders_customer_name_check,
  VALIDATE CONSTRAINT orders_jewellery_name_check,
  VALIDATE CONSTRAINT orders_advance_amount_check,
  VALIDATE CONSTRAINT orders_delivery_deadline_check,
  VALIDATE CONSTRAINT orders_additional_notes_check,
  VALIDATE CONSTRAINT orders_status_check;

CREATE TABLE IF NOT EXISTS order_reminders (
  id UUID DEFAULT gen_random_uuid(),
  order_id UUID,
  reminder_at TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled',
  version INTEGER DEFAULT 1,
  delivery_attempts INTEGER DEFAULT 0,
  dispatch_lease_until TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE order_reminders
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispatch_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE order_reminders
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN status SET DEFAULT 'scheduled',
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN delivery_attempts SET DEFAULT 0,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN order_id SET NOT NULL,
  ALTER COLUMN reminder_at SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN version SET NOT NULL,
  ALTER COLUMN delivery_attempts SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_reminders'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE order_reminders ADD CONSTRAINT order_reminders_pkey PRIMARY KEY (id);
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'order_reminders'::regclass
      AND c.contype = 'p'
      AND cardinality(c.conkey) = 1
      AND a.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'The existing order_reminders table has a primary key other than order_reminders.id; review the schema before migrating.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_reminders'::regclass
      AND conname = 'order_reminders_order_id_key'
  ) THEN
    ALTER TABLE order_reminders
      ADD CONSTRAINT order_reminders_order_id_key UNIQUE (order_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_reminders'::regclass
      AND conname = 'order_reminders_order_id_fkey'
  ) THEN
    ALTER TABLE order_reminders
      ADD CONSTRAINT order_reminders_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_reminders'::regclass
      AND conname = 'order_reminders_status_check'
  ) THEN
    ALTER TABLE order_reminders ADD CONSTRAINT order_reminders_status_check
      CHECK (status IN ('scheduled', 'dispatching', 'delivered', 'dismissed', 'completed')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_reminders'::regclass
      AND conname = 'order_reminders_version_check'
  ) THEN
    ALTER TABLE order_reminders ADD CONSTRAINT order_reminders_version_check
      CHECK (version > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'order_reminders'::regclass
      AND conname = 'order_reminders_delivery_attempts_check'
  ) THEN
    ALTER TABLE order_reminders ADD CONSTRAINT order_reminders_delivery_attempts_check
      CHECK (delivery_attempts >= 0) NOT VALID;
  END IF;
END
$$;

ALTER TABLE order_reminders
  VALIDATE CONSTRAINT order_reminders_order_id_fkey,
  VALIDATE CONSTRAINT order_reminders_status_check,
  VALIDATE CONSTRAINT order_reminders_version_check,
  VALIDATE CONSTRAINT order_reminders_delivery_attempts_check;

CREATE TABLE IF NOT EXISTS notification_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  order_id UUID,
  reminder_id UUID,
  event_type TEXT,
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_history
  ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS reminder_id UUID,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE notification_history
  ALTER COLUMN details SET DEFAULT '{}'::JSONB,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN order_id SET NOT NULL,
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN details SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'notification_history'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE notification_history ADD CONSTRAINT notification_history_pkey PRIMARY KEY (id);
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'notification_history'::regclass
      AND c.contype = 'p'
      AND cardinality(c.conkey) = 1
      AND a.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'The existing notification_history table has a primary key other than notification_history.id; review the schema before migrating.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'notification_history'::regclass
      AND conname = 'notification_history_order_id_fkey'
  ) THEN
    ALTER TABLE notification_history
      ADD CONSTRAINT notification_history_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'notification_history'::regclass
      AND conname = 'notification_history_reminder_id_fkey'
  ) THEN
    ALTER TABLE notification_history
      ADD CONSTRAINT notification_history_reminder_id_fkey
      FOREIGN KEY (reminder_id) REFERENCES order_reminders(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'notification_history'::regclass
      AND conname = 'notification_history_event_type_check'
  ) THEN
    ALTER TABLE notification_history ADD CONSTRAINT notification_history_event_type_check
      CHECK (event_type IN (
        'scheduled', 'rescheduled', 'push_sent', 'push_failed',
        'dispatch_completed', 'popup_shown', 'dismissed', 'completed'
      )) NOT VALID;
  END IF;
END
$$;

ALTER TABLE notification_history
  VALIDATE CONSTRAINT notification_history_order_id_fkey,
  VALIDATE CONSTRAINT notification_history_reminder_id_fkey,
  VALIDATE CONSTRAINT notification_history_event_type_check;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  endpoint TEXT,
  subscription JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS endpoint TEXT,
  ADD COLUMN IF NOT EXISTS subscription JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE push_subscriptions
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN last_seen_at SET DEFAULT NOW(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN endpoint SET NOT NULL,
  ALTER COLUMN subscription SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'push_subscriptions'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
  ELSIF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.conrelid = 'push_subscriptions'::regclass
      AND c.contype = 'p'
      AND cardinality(c.conkey) = 1
      AND a.attname = 'id'
  ) THEN
    RAISE EXCEPTION 'The existing push_subscriptions table has a primary key other than push_subscriptions.id; review the schema before migrating.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'push_subscriptions'::regclass
      AND conname = 'push_subscriptions_endpoint_key'
  ) THEN
    ALTER TABLE push_subscriptions
      ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS orders_deadline_status_idx
  ON orders (delivery_deadline, status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS order_reminders_due_idx
  ON order_reminders (reminder_at, status);
CREATE INDEX IF NOT EXISTS notification_history_order_idx
  ON notification_history (order_id, created_at DESC);
