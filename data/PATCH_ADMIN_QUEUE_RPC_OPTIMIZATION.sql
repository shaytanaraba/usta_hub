-- ============================================================================
-- PATCH: Admin Queue RPC Optimization
-- Purpose:
-- 1) Replace full-table admin queue load with paged RPC response.
-- 2) Return queue data and aggregate counters in one call:
--    { items, total_count, status_counts, attention_items, attention_count }.
-- 3) Add focused indexes for queue filtering/sorting paths.
-- Run in Supabase SQL Editor.
-- ============================================================================

-- 1) Indexes for admin queue filters/sorts.
CREATE INDEX IF NOT EXISTS idx_orders_admin_status_created_at
  ON public.orders(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_admin_dispatcher_created_at
  ON public.orders(dispatcher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_admin_assigned_dispatcher_created_at
  ON public.orders(assigned_dispatcher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_admin_urgency_service_created_at
  ON public.orders(urgency, service_type, created_at DESC);

-- 2) RPC: server-side paged queue load for admin.
CREATE OR REPLACE FUNCTION public.get_admin_orders_page(
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 20,
  p_status TEXT DEFAULT 'Active',
  p_search TEXT DEFAULT '',
  p_dispatcher TEXT DEFAULT 'all',
  p_urgency TEXT DEFAULT 'all',
  p_service TEXT DEFAULT 'all',
  p_sort TEXT DEFAULT 'newest'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_limit INTEGER := GREATEST(COALESCE(p_limit, 20), 1);
  v_offset INTEGER := 0;
  v_can_view BOOLEAN := FALSE;
  v_status TEXT := COALESCE(NULLIF(p_status, ''), 'Active');
  v_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
  v_search_digits TEXT := regexp_replace(COALESCE(p_search, ''), '\D', '', 'g');
  v_sort_asc BOOLEAN := (LOWER(COALESCE(p_sort, 'newest')) = 'oldest');
  v_total_count BIGINT := 0;
  v_status_counts JSONB := jsonb_build_object('Active', 0, 'Payment', 0, 'Confirmed', 0, 'Canceled', 0);
  v_attention_items JSONB := '[]'::JSONB;
  v_attention_count BIGINT := 0;
  v_items JSONB := '[]'::JSONB;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND COALESCE(p.is_active, TRUE) = TRUE
  ) INTO v_can_view;

  IF NOT v_can_view THEN
    RETURN jsonb_build_object(
      'total_count', 0,
      'items', '[]'::JSONB,
      'status_counts', v_status_counts,
      'attention_items', '[]'::JSONB,
      'attention_count', 0
    );
  END IF;

  v_offset := (v_page - 1) * v_limit;

  WITH scoped AS (
    SELECT
      o.*,
      jsonb_build_object('full_name', c.full_name, 'phone', c.phone) AS client,
      jsonb_build_object('full_name', m.full_name, 'phone', m.phone) AS master,
      jsonb_build_object('id', d.id, 'full_name', d.full_name, 'phone', d.phone) AS dispatcher,
      jsonb_build_object('id', ad.id, 'full_name', ad.full_name, 'phone', ad.phone) AS assigned_dispatcher
    FROM public.orders o
    LEFT JOIN public.profiles c ON c.id = o.client_id
    LEFT JOIN public.profiles m ON m.id = o.master_id
    LEFT JOIN public.profiles d ON d.id = o.dispatcher_id
    LEFT JOIN public.profiles ad ON ad.id = o.assigned_dispatcher_id
    WHERE
      COALESCE(o.is_disputed, FALSE) = FALSE
      AND
      (p_dispatcher = 'all'
        OR (p_dispatcher = 'unassigned' AND o.dispatcher_id IS NULL AND o.assigned_dispatcher_id IS NULL)
        OR (p_dispatcher NOT IN ('all', 'unassigned')
            AND (o.dispatcher_id::TEXT = p_dispatcher OR o.assigned_dispatcher_id::TEXT = p_dispatcher)))
      AND (p_urgency = 'all' OR o.urgency = p_urgency)
      AND (p_service = 'all' OR o.service_type = p_service)
      AND (
        v_search = ''
        OR o.id::TEXT ILIKE '%' || v_search || '%'
        OR LOWER(COALESCE(c.full_name, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(o.full_address, '')) LIKE '%' || v_search || '%'
        OR (
          v_search_digits <> ''
          AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') LIKE '%' || v_search_digits || '%'
        )
      )
  ),
  status_counted AS (
    SELECT
      SUM(CASE WHEN status IN ('placed', 'reopened', 'claimed', 'started') THEN 1 ELSE 0 END)::BIGINT AS active_count,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::BIGINT AS payment_count,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)::BIGINT AS confirmed_count,
      SUM(CASE WHEN status LIKE 'canceled%' THEN 1 ELSE 0 END)::BIGINT AS canceled_count
    FROM scoped
  ),
  attention AS (
    SELECT *
    FROM scoped s
    WHERE
      s.status = 'completed'
      OR s.status = 'canceled_by_master'
      OR (s.status = 'placed' AND NOW() - s.created_at > INTERVAL '15 minutes')
      OR (s.status = 'claimed' AND NOW() - COALESCE(s.updated_at, s.created_at) > INTERVAL '30 minutes')
  ),
  filtered AS (
    SELECT *
    FROM scoped s
    WHERE
      (v_status = 'Active' AND s.status IN ('placed', 'reopened', 'claimed', 'started'))
      OR (v_status = 'Payment' AND s.status = 'completed')
      OR (v_status = 'Confirmed' AND s.status = 'confirmed')
      OR (v_status = 'Canceled' AND s.status LIKE 'canceled%')
  ),
  counted AS (
    SELECT COUNT(*)::BIGINT AS total_count
    FROM filtered
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN v_sort_asc THEN created_at END ASC,
      CASE WHEN NOT v_sort_asc THEN created_at END DESC
    OFFSET v_offset
    LIMIT v_limit
  ),
  attention_paged AS (
    SELECT *
    FROM attention
    ORDER BY created_at DESC
    LIMIT 30
  )
  SELECT
    c.total_count,
    jsonb_build_object(
      'Active', COALESCE(sc.active_count, 0),
      'Payment', COALESCE(sc.payment_count, 0),
      'Confirmed', COALESCE(sc.confirmed_count, 0),
      'Canceled', COALESCE(sc.canceled_count, 0)
    ),
    (SELECT COUNT(*)::BIGINT FROM attention),
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.created_at DESC) FROM attention_paged ap),
      '[]'::JSONB
    ),
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(p) ORDER BY
        CASE WHEN v_sort_asc THEN p.created_at END ASC,
        CASE WHEN NOT v_sort_asc THEN p.created_at END DESC
      ) FROM paged p),
      '[]'::JSONB
    )
  INTO v_total_count, v_status_counts, v_attention_count, v_attention_items, v_items
  FROM counted c
  CROSS JOIN status_counted sc;

  RETURN jsonb_build_object(
    'total_count', COALESCE(v_total_count, 0),
    'items', COALESCE(v_items, '[]'::JSONB),
    'status_counts', COALESCE(v_status_counts, jsonb_build_object('Active', 0, 'Payment', 0, 'Confirmed', 0, 'Canceled', 0)),
    'attention_items', COALESCE(v_attention_items, '[]'::JSONB),
    'attention_count', COALESCE(v_attention_count, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_admin_orders_page IS
'Returns paged admin orders queue with status counters and needs-attention list in one RPC call.';

GRANT EXECUTE ON FUNCTION public.get_admin_orders_page TO authenticated;

-- ============================================================================
-- END PATCH
-- ============================================================================
