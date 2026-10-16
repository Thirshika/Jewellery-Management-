CREATE TABLE IF NOT EXISTS saved_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL CHECK (length(trim(customer_name)) BETWEEN 1 AND 160),
  bill_date DATE NOT NULL,
  bill_data JSONB NOT NULL CHECK (jsonb_typeof(bill_data) = 'object'),
  total_amount NUMERIC(14, 2) NOT NULL CHECK (total_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS saved_bills_date_created_idx
  ON saved_bills (bill_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS saved_bills_order_idx
  ON saved_bills (order_id)
  WHERE order_id IS NOT NULL;
