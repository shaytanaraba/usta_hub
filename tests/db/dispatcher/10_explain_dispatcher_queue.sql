-- Dispatcher queue explain plan checks
-- Goal: confirm indexed path and bounded sort/scan cost.

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

-- 1) Explain the RPC call itself
EXPLAIN (ANALYZE, BUFFERS)
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
  1,
  20,
  'Active',
  '',
  'all',
  'all',
  'newest'
);

-- 2) Explain equivalent base query for index visibility
EXPLAIN (ANALYZE, BUFFERS)
WITH dispatcher AS (
  SELECT id
  FROM public.profiles
  WHERE role = 'dispatcher'
    AND is_active = TRUE
  ORDER BY created_at ASC
  LIMIT 1
)
SELECT o.id, o.status, o.created_at
FROM public.orders o
WHERE (
    o.dispatcher_id = (SELECT id FROM dispatcher)
    OR o.assigned_dispatcher_id = (SELECT id FROM dispatcher)
  )
  AND o.status IN ('placed', 'reopened', 'claimed', 'started')
ORDER BY o.created_at DESC
LIMIT 20;

