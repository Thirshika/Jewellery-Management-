CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 160),
  jewellery_name TEXT NOT NULL CHECK (length(trim(jewellery_name)) BETWEEN 1 AND 160),
  advance_amount NUMERIC(12, 2) NOT NULL CHECK (advance_amount >= 0),
  order_date DATE NOT NULL,
  delivery_deadline DATE NOT NULL CHECK (delivery_deadline >= order_date),
  additional_notes TEXT NOT NULL DEFAULT '' CHECK (length(additional_notes) <= 5000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  reminder_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'dispatching', 'delivered', 'dismissed', 'completed')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  dispatch_lease_until TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reminder_id UUID REFERENCES order_reminders(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'scheduled',
    'rescheduled',
    'push_sent',
    'push_failed',
    'dispatch_completed',
    'popup_shown',
    'dismissed',
    'completed'
  )),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_deadline_status_idx
  ON orders (delivery_deadline, status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS order_reminders_due_idx
  ON order_reminders (reminder_at, status);
CREATE INDEX IF NOT EXISTS notification_history_order_idx
  ON notification_history (order_id, created_at DESC);
