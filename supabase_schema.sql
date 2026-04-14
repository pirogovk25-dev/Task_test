-- Выполните этот SQL в Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS orders (
  id           SERIAL PRIMARY KEY,
  crm_id       TEXT UNIQUE NOT NULL,
  number       TEXT,
  status       TEXT,
  total_sum    NUMERIC,
  created_at   TIMESTAMP WITH TIME ZONE,
  customer_name TEXT,
  raw_data     JSONB
);

-- Индекс для быстрой фильтрации по дате
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);
