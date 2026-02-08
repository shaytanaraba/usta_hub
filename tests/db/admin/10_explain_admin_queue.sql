-- Admin queue explain plan checks
-- Goal: confirm bounded page load and index-friendly filtering path.

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

-- 1) Explain RPC call
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.get_admin_orders_page(
  1,            -- page
  20,           -- limit
  'Active',     -- status
  '',           -- search
  'all',        -- dispatcher
  'all',        -- urgency
  'all',        -- service
  'newest'      -- sort
);

-- 2) Explain equivalent base query
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.id, o.status, o.created_at
FROM public.orders o
WHERE o.status IN ('placed', 'reopened', 'claimed', 'started')
ORDER BY o.created_at DESC
LIMIT 20;

