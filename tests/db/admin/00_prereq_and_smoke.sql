-- Admin queue optimization smoke test
-- Run in Supabase SQL Editor after:
--   data/PATCH_ADMIN_QUEUE_RPC_OPTIMIZATION.sql

-- 1) Function existence
SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_admin_orders_page';

-- 2) Index existence
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'orders'
  AND indexname IN (
    'idx_orders_admin_status_created_at',
    'idx_orders_admin_dispatcher_created_at',
    'idx_orders_admin_assigned_dispatcher_created_at',
    'idx_orders_admin_urgency_service_created_at'
  )
ORDER BY indexname;

-- 3) Pick an active admin for auth context
WITH admin_ctx AS (
  SELECT id::text AS id
  FROM public.profiles
  WHERE role = 'admin'
    AND COALESCE(is_active, TRUE) = TRUE
  ORDER BY created_at ASC
  LIMIT 1
)
SELECT
  set_config('request.jwt.claim.role', 'authenticated', true) AS jwt_role,
  set_config('request.jwt.claim.sub', (SELECT id FROM admin_ctx), true) AS jwt_sub;

-- 4) Smoke call
SELECT public.get_admin_orders_page(
  1,             -- page
  20,            -- limit
  'Active',      -- status
  '',            -- search
  'all',         -- dispatcher
  'all',         -- urgency
  'all',         -- service
  'newest'       -- sort
) AS payload;

