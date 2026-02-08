-- Dispatcher DB optimization smoke checks
-- Run in Supabase SQL editor after applying:
-- data/PATCH_DISPATCHER_QUEUE_RPC_OPTIMIZATION.sql

-- 1) Verify indexes are present
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_orders_dispatcher_scope_assigned_created',
    'idx_orders_dispatcher_scope_creator_created',
    'idx_orders_dispatcher_scope_status_created',
    'idx_orders_assigned_scope_status_created',
    'idx_orders_dispatcher_scope_urgency_service_created',
    'idx_orders_assigned_scope_urgency_service_created'
  )
ORDER BY indexname;

-- 2) Verify RPCs exist
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'get_dispatcher_orders_page',
    'get_dispatcher_stats_summary'
  )
ORDER BY proname;

-- 3) Pick one active dispatcher
WITH dispatcher AS (
  SELECT id::text AS id
  FROM public.profiles
  WHERE role = 'dispatcher'
    AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1
)
SELECT
  set_config('request.jwt.claim.role', 'authenticated', true) AS jwt_role,
  set_config('request.jwt.claim.sub', (SELECT id FROM dispatcher), true) AS jwt_sub;

-- 4) Queue RPC smoke call
WITH dispatcher AS (
  SELECT id
  FROM public.profiles
  WHERE role = 'dispatcher'
    AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1
)
SELECT public.get_dispatcher_orders_page(
  (SELECT id FROM dispatcher),
  1,            -- page
  20,           -- limit
  'Active',     -- status
  '',           -- search
  'all',        -- urgency
  'all',        -- service
  'newest'      -- sort
) AS queue_payload;

-- 5) Stats RPC smoke call
WITH dispatcher AS (
  SELECT id
  FROM public.profiles
  WHERE role = 'dispatcher'
    AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1
)
SELECT public.get_dispatcher_stats_summary(
  (SELECT id FROM dispatcher),
  7
) AS stats_payload;

