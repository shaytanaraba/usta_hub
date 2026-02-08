-- Admin queue analysis snapshot
-- Use this after running 00/10 scripts.

-- Quick inventory
SELECT
  COUNT(*) AS total_orders,
  COUNT(*) FILTER (WHERE status IN ('placed', 'reopened', 'claimed', 'started')) AS active_orders,
  COUNT(*) FILTER (WHERE status = 'completed') AS payment_orders,
  COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_orders,
  COUNT(*) FILTER (WHERE status LIKE 'canceled%') AS canceled_orders
FROM public.orders;

-- Index sizes
SELECT
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes i
JOIN pg_class c ON c.relname = i.indexname
JOIN pg_index x ON x.indexrelid = c.oid
WHERE i.schemaname = 'public'
  AND i.tablename = 'orders'
  AND i.indexname IN (
    'idx_orders_admin_status_created_at',
    'idx_orders_admin_dispatcher_created_at',
    'idx_orders_admin_assigned_dispatcher_created_at',
    'idx_orders_admin_urgency_service_created_at'
  )
ORDER BY i.indexname;

-- Function metadata
SELECT
  p.proname,
  pg_get_functiondef(p.oid) LIKE '%get_admin_orders_page%' AS function_present
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_admin_orders_page';

