-- ============================================================================
-- PATCH: Dispatcher Queue RPC Optimization
-- Purpose:
-- 1) Move dispatcher queue filtering/sorting/pagination to DB RPC.
-- 2) Return queue items + total_count + status_counts + attention items in one call.
-- 3) Add RPC for dispatcher stats summary to avoid large client-side scans.
-- Run in Supabase SQL Editor.
-- ============================================================================

-- 1) Indexes for dispatcher queue scope and sort.
CREATE INDEX IF NOT EXISTS idx_orders_dispatcher_scope_assigned_created
  ON public.orders(assigned_dispatcher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_dispatcher_scope_creator_created
  ON public.orders(dispatcher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_dispatcher_scope_status_created
  ON public.orders(dispatcher_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_scope_status_created
  ON public.orders(assigned_dispatcher_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_dispatcher_scope_urgency_service_created
  ON public.orders(dispatcher_id, urgency, service_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_scope_urgency_service_created
  ON public.orders(assigned_dispatcher_id, urgency, service_type, created_at DESC);

-- 2) Queue RPC with one roundtrip response.
CREATE OR REPLACE FUNCTION public.get_dispatcher_orders_page(
  p_dispatcher_id UUID,
  p_page INTEGER DEFAULT 1,
  p_limit INTEGER DEFAULT 20,
  p_status TEXT DEFAULT 'Active',
  p_search TEXT DEFAULT '',
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
  v_uid UUID := auth.uid();
  v_effective_dispatcher UUID := COALESCE(p_dispatcher_id, auth.uid());
  v_role TEXT;
  v_is_verified BOOLEAN := FALSE;
  v_is_active BOOLEAN := FALSE;
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_limit INTEGER := GREATEST(COALESCE(p_limit, 20), 1);
  v_offset INTEGER;
  v_total_count BIGINT := 0;
  v_items JSONB := '[]'::JSONB;
  v_status_counts JSONB := jsonb_build_object('Active', 0, 'Payment', 0, 'Confirmed', 0, 'Canceled', 0);
  v_attention_items JSONB := '[]'::JSONB;
  v_attention_count BIGINT := 0;
  v_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
  v_search_digits TEXT := REGEXP_REPLACE(COALESCE(p_search, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_uid IS NULL OR v_effective_dispatcher IS NULL THEN
    RETURN jsonb_build_object(
      'total_count', 0,
      'items', '[]'::JSONB,
      'status_counts', v_status_counts,
      'attention_items', '[]'::JSONB,
      'attention_count', 0
    );
  END IF;

  SELECT p.role, p.is_verified, p.is_active
  INTO v_role, v_is_verified, v_is_active
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_role IS NULL OR v_is_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object(
      'total_count', 0,
      'items', '[]'::JSONB,
      'status_counts', v_status_counts,
      'attention_items', '[]'::JSONB,
      'attention_count', 0
    );
  END IF;

  -- Dispatcher can only query own scope; admin can query any dispatcher scope.
  IF v_role = 'dispatcher' AND v_uid <> v_effective_dispatcher THEN
    RETURN jsonb_build_object(
      'total_count', 0,
      'items', '[]'::JSONB,
      'status_counts', v_status_counts,
      'attention_items', '[]'::JSONB,
      'attention_count', 0
    );
  END IF;

  -- Optional verification guard for dispatcher role.
  IF v_role = 'dispatcher' AND v_is_verified IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object(
      'total_count', 0,
      'items', '[]'::JSONB,
      'status_counts', v_status_counts,
      'attention_items', '[]'::JSONB,
      'attention_count', 0
    );
  END IF;

  v_offset := (v_page - 1) * v_limit;

  WITH base_scope AS (
    SELECT
      o.*,
      CASE
        WHEN c.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', c.id, 'full_name', c.full_name, 'phone', c.phone, 'email', c.email)
      END AS client,
      CASE
        WHEN m.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone)
      END AS master,
      CASE
        WHEN d.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', d.id, 'full_name', d.full_name, 'phone', d.phone)
      END AS dispatcher,
      CASE
        WHEN ad.id IS NULL THEN NULL
        ELSE jsonb_build_object('id', ad.id, 'full_name', ad.full_name, 'phone', ad.phone)
      END AS assigned_dispatcher
    FROM public.orders o
    LEFT JOIN public.profiles c ON c.id = o.client_id
    LEFT JOIN public.profiles m ON m.id = o.master_id
    LEFT JOIN public.profiles d ON d.id = o.dispatcher_id
    LEFT JOIN public.profiles ad ON ad.id = o.assigned_dispatcher_id
    WHERE o.dispatcher_id = v_effective_dispatcher
       OR o.assigned_dispatcher_id = v_effective_dispatcher
  ),
  filtered AS (
    SELECT *
    FROM base_scope b
    WHERE
      (
        p_status = 'Active' AND b.status IN ('placed', 'reopened', 'claimed', 'started')
        OR p_status = 'Payment' AND b.status = 'completed'
        OR p_status = 'Confirmed' AND b.status = 'confirmed'
        OR p_status = 'Canceled' AND b.status IN ('canceled_by_master', 'canceled_by_client')
        OR p_status IS NULL
        OR p_status = 'all'
      )
      AND (p_urgency = 'all' OR b.urgency = p_urgency)
      AND (p_service = 'all' OR b.service_type = p_service)
      AND (
        v_search = ''
        OR b.id::TEXT ILIKE '%' || v_search || '%'
        OR LOWER(COALESCE(b.client_name, b.client->>'full_name', '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(b.full_address, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(b.problem_description, '')) LIKE '%' || v_search || '%'
        OR LOWER(COALESCE(b.master->>'full_name', '')) LIKE '%' || v_search || '%'
        OR (
          v_search_digits <> ''
          AND REGEXP_REPLACE(COALESCE(b.client_phone, b.client->>'phone', ''), '[^0-9]', '', 'g') LIKE '%' || v_search_digits || '%'
        )
      )
  ),
  paged AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_sort = 'oldest' THEN created_at END ASC,
      CASE WHEN p_sort <> 'oldest' THEN created_at END DESC
    OFFSET v_offset
    LIMIT v_limit
  ),
  counts AS (
    SELECT COUNT(*)::BIGINT AS total_count
    FROM filtered
  ),
  status_counts AS (
    SELECT jsonb_build_object(
      'Active', COUNT(*) FILTER (WHERE status IN ('placed', 'reopened', 'claimed', 'started')),
      'Payment', COUNT(*) FILTER (WHERE status = 'completed'),
      'Confirmed', COUNT(*) FILTER (WHERE status = 'confirmed'),
      'Canceled', COUNT(*) FILTER (WHERE status IN ('canceled_by_master', 'canceled_by_client'))
    ) AS val
    FROM base_scope
  ),
  attention_pool AS (
    SELECT *
    FROM base_scope
    WHERE
      is_disputed = TRUE
      OR status = 'completed'
      OR status = 'canceled_by_master'
      OR (status = 'placed' AND created_at < NOW() - INTERVAL '15 minutes')
      OR (status = 'claimed' AND COALESCE(updated_at, created_at) < NOW() - INTERVAL '30 minutes')
    ORDER BY created_at DESC
  ),
  attention_count AS (
    SELECT COUNT(*)::BIGINT AS total FROM attention_pool
  ),
  attention_items AS (
    SELECT COALESCE(
      jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC),
      '[]'::JSONB
    ) AS val
    FROM (SELECT * FROM attention_pool LIMIT 20) a
  )
  SELECT
    c.total_count,
    COALESCE(jsonb_agg(to_jsonb(p) ORDER BY
      CASE WHEN p_sort = 'oldest' THEN p.created_at END ASC,
      CASE WHEN p_sort <> 'oldest' THEN p.created_at END DESC
    ) FILTER (WHERE p.id IS NOT NULL), '[]'::JSONB),
    sc.val,
    ai.val,
    ac.total
  INTO v_total_count, v_items, v_status_counts, v_attention_items, v_attention_count
  FROM counts c
  LEFT JOIN paged p ON TRUE
  CROSS JOIN status_counts sc
  CROSS JOIN attention_items ai
  CROSS JOIN attention_count ac
  GROUP BY c.total_count, sc.val, ai.val, ac.total;

  RETURN jsonb_build_object(
    'total_count', COALESCE(v_total_count, 0),
    'items', COALESCE(v_items, '[]'::JSONB),
    'status_counts', COALESCE(v_status_counts, jsonb_build_object('Active', 0, 'Payment', 0, 'Confirmed', 0, 'Canceled', 0)),
    'attention_items', COALESCE(v_attention_items, '[]'::JSONB),
    'attention_count', COALESCE(v_attention_count, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.get_dispatcher_orders_page IS
'Returns dispatcher queue page + total_count + status_counts + attention block in one RPC call.';

GRANT EXECUTE ON FUNCTION public.get_dispatcher_orders_page TO authenticated;

-- 3) Stats RPC (current/previous period + trend series).
CREATE OR REPLACE FUNCTION public.get_dispatcher_stats_summary(
  p_dispatcher_id UUID,
  p_days INTEGER DEFAULT 7
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_effective_dispatcher UUID := COALESCE(p_dispatcher_id, auth.uid());
  v_role TEXT;
  v_is_active BOOLEAN := FALSE;
  v_days INTEGER := GREATEST(COALESCE(p_days, 7), 1);
  v_start_date DATE;
  v_end_date DATE := CURRENT_DATE;
  v_prev_start DATE;
  v_current JSONB;
  v_previous JSONB;
  v_created_series JSONB := '[]'::JSONB;
  v_handled_series JSONB := '[]'::JSONB;
BEGIN
  IF v_uid IS NULL OR v_effective_dispatcher IS NULL THEN
    RETURN jsonb_build_object(
      'current', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0, 'completionRate', 0, 'cancelRate', 0),
      'previous', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0, 'completionRate', 0, 'cancelRate', 0),
      'delta', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0),
      'series', jsonb_build_object('created', '[]'::JSONB, 'handled', '[]'::JSONB),
      'range', jsonb_build_object('days', v_days)
    );
  END IF;

  SELECT p.role, p.is_active
  INTO v_role, v_is_active
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_role IS NULL OR v_is_active IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object(
      'current', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0, 'completionRate', 0, 'cancelRate', 0),
      'previous', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0, 'completionRate', 0, 'cancelRate', 0),
      'delta', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0),
      'series', jsonb_build_object('created', '[]'::JSONB, 'handled', '[]'::JSONB),
      'range', jsonb_build_object('days', v_days)
    );
  END IF;

  IF v_role = 'dispatcher' AND v_uid <> v_effective_dispatcher THEN
    RETURN jsonb_build_object(
      'current', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0, 'completionRate', 0, 'cancelRate', 0),
      'previous', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0, 'completionRate', 0, 'cancelRate', 0),
      'delta', jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0),
      'series', jsonb_build_object('created', '[]'::JSONB, 'handled', '[]'::JSONB),
      'range', jsonb_build_object('days', v_days)
    );
  END IF;

  v_start_date := v_end_date - (v_days - 1);
  v_prev_start := v_start_date - v_days;

  WITH scope AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.dispatcher_id = v_effective_dispatcher
       OR o.assigned_dispatcher_id = v_effective_dispatcher
  ),
  current_window AS (
    SELECT *
    FROM scope
    WHERE created_at::date BETWEEN v_start_date AND v_end_date
  ),
  previous_window AS (
    SELECT *
    FROM scope
    WHERE created_at::date BETWEEN v_prev_start AND (v_start_date - 1)
  ),
  current_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE dispatcher_id = v_effective_dispatcher) AS created_count,
      COUNT(*) FILTER (WHERE COALESCE(assigned_dispatcher_id, dispatcher_id) = v_effective_dispatcher) AS handled_count,
      COUNT(*) FILTER (WHERE status IN ('completed', 'confirmed')) AS completed_count,
      COUNT(*) FILTER (WHERE status IN ('canceled_by_master', 'canceled_by_client')) AS canceled_count
    FROM current_window
  ),
  previous_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE dispatcher_id = v_effective_dispatcher) AS created_count,
      COUNT(*) FILTER (WHERE COALESCE(assigned_dispatcher_id, dispatcher_id) = v_effective_dispatcher) AS handled_count,
      COUNT(*) FILTER (WHERE status IN ('completed', 'confirmed')) AS completed_count,
      COUNT(*) FILTER (WHERE status IN ('canceled_by_master', 'canceled_by_client')) AS canceled_count
    FROM previous_window
  )
  SELECT
    jsonb_build_object(
      'created', COALESCE(c.created_count, 0),
      'handled', COALESCE(c.handled_count, 0),
      'completed', COALESCE(c.completed_count, 0),
      'canceled', COALESCE(c.canceled_count, 0),
      'completionRate',
        CASE WHEN COALESCE(c.created_count, 0) = 0 THEN 0
             ELSE ROUND((COALESCE(c.completed_count, 0)::NUMERIC / c.created_count::NUMERIC) * 100)::INT
        END,
      'cancelRate',
        CASE WHEN COALESCE(c.created_count, 0) = 0 THEN 0
             ELSE ROUND((COALESCE(c.canceled_count, 0)::NUMERIC / c.created_count::NUMERIC) * 100)::INT
        END
    ),
    jsonb_build_object(
      'created', COALESCE(p.created_count, 0),
      'handled', COALESCE(p.handled_count, 0),
      'completed', COALESCE(p.completed_count, 0),
      'canceled', COALESCE(p.canceled_count, 0),
      'completionRate',
        CASE WHEN COALESCE(p.created_count, 0) = 0 THEN 0
             ELSE ROUND((COALESCE(p.completed_count, 0)::NUMERIC / p.created_count::NUMERIC) * 100)::INT
        END,
      'cancelRate',
        CASE WHEN COALESCE(p.created_count, 0) = 0 THEN 0
             ELSE ROUND((COALESCE(p.canceled_count, 0)::NUMERIC / p.created_count::NUMERIC) * 100)::INT
        END
    )
  INTO v_current, v_previous
  FROM current_counts c
  CROSS JOIN previous_counts p;

  WITH scope AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.dispatcher_id = v_effective_dispatcher
       OR o.assigned_dispatcher_id = v_effective_dispatcher
  ),
  days AS (
    SELECT generate_series(v_start_date, v_end_date, interval '1 day')::date AS day
  ),
  created_counts AS (
    SELECT d.day, COUNT(s.id)::INT AS cnt
    FROM days d
    LEFT JOIN scope s
      ON s.dispatcher_id = v_effective_dispatcher
     AND s.created_at::date = d.day
    GROUP BY d.day
    ORDER BY d.day
  ),
  handled_counts AS (
    SELECT d.day, COUNT(s.id)::INT AS cnt
    FROM days d
    LEFT JOIN scope s
      ON COALESCE(s.assigned_dispatcher_id, s.dispatcher_id) = v_effective_dispatcher
     AND COALESCE(s.updated_at, s.created_at)::date = d.day
    GROUP BY d.day
    ORDER BY d.day
  )
  SELECT
    COALESCE((SELECT jsonb_agg(c.cnt ORDER BY c.day) FROM created_counts c), '[]'::JSONB),
    COALESCE((SELECT jsonb_agg(h.cnt ORDER BY h.day) FROM handled_counts h), '[]'::JSONB)
  INTO v_created_series, v_handled_series;

  RETURN jsonb_build_object(
    'current', COALESCE(v_current, jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0, 'completionRate', 0, 'cancelRate', 0)),
    'previous', COALESCE(v_previous, jsonb_build_object('created', 0, 'handled', 0, 'completed', 0, 'canceled', 0, 'completionRate', 0, 'cancelRate', 0)),
    'delta', jsonb_build_object(
      'created',
        CASE
          WHEN COALESCE((v_previous->>'created')::INT, 0) = 0 AND COALESCE((v_current->>'created')::INT, 0) = 0 THEN 0
          WHEN COALESCE((v_previous->>'created')::INT, 0) = 0 THEN 100
          ELSE ROUND((((v_current->>'created')::NUMERIC - (v_previous->>'created')::NUMERIC) / NULLIF((v_previous->>'created')::NUMERIC, 0)) * 100)::INT
        END,
      'handled',
        CASE
          WHEN COALESCE((v_previous->>'handled')::INT, 0) = 0 AND COALESCE((v_current->>'handled')::INT, 0) = 0 THEN 0
          WHEN COALESCE((v_previous->>'handled')::INT, 0) = 0 THEN 100
          ELSE ROUND((((v_current->>'handled')::NUMERIC - (v_previous->>'handled')::NUMERIC) / NULLIF((v_previous->>'handled')::NUMERIC, 0)) * 100)::INT
        END,
      'completed',
        CASE
          WHEN COALESCE((v_previous->>'completed')::INT, 0) = 0 AND COALESCE((v_current->>'completed')::INT, 0) = 0 THEN 0
          WHEN COALESCE((v_previous->>'completed')::INT, 0) = 0 THEN 100
          ELSE ROUND((((v_current->>'completed')::NUMERIC - (v_previous->>'completed')::NUMERIC) / NULLIF((v_previous->>'completed')::NUMERIC, 0)) * 100)::INT
        END,
      'canceled',
        CASE
          WHEN COALESCE((v_previous->>'canceled')::INT, 0) = 0 AND COALESCE((v_current->>'canceled')::INT, 0) = 0 THEN 0
          WHEN COALESCE((v_previous->>'canceled')::INT, 0) = 0 THEN 100
          ELSE ROUND((((v_current->>'canceled')::NUMERIC - (v_previous->>'canceled')::NUMERIC) / NULLIF((v_previous->>'canceled')::NUMERIC, 0)) * 100)::INT
        END
    ),
    'series', jsonb_build_object(
      'created', COALESCE(v_created_series, '[]'::JSONB),
      'handled', COALESCE(v_handled_series, '[]'::JSONB)
    ),
    'range', jsonb_build_object(
      'days', v_days,
      'startDate', v_start_date::TEXT,
      'endDate', v_end_date::TEXT
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_dispatcher_stats_summary IS
'Returns dispatcher stats summary (current/previous period + trend series) in one RPC call.';

GRANT EXECUTE ON FUNCTION public.get_dispatcher_stats_summary TO authenticated;

-- ============================================================================
-- END PATCH
-- ============================================================================

