# Dispatcher DB Optimization Notes

This file documents DB-only optimizations for dispatcher queue/stats.

## Patch File

- `data/PATCH_DISPATCHER_QUEUE_RPC_OPTIMIZATION.sql`

## What The Patch Adds

1. Dispatcher queue indexes
- `idx_orders_dispatcher_scope_assigned_created`
- `idx_orders_dispatcher_scope_creator_created`
- `idx_orders_dispatcher_scope_status_created`
- `idx_orders_assigned_scope_status_created`
- `idx_orders_dispatcher_scope_urgency_service_created`
- `idx_orders_assigned_scope_urgency_service_created`

2. RPC: `public.get_dispatcher_orders_page(...)`
- Server-side pagination
- Server-side filtering (`status`, `search`, `urgency`, `service`)
- Server-side sort (`newest`/`oldest`)
- Returns in one payload:
  - `items`
  - `total_count`
  - `status_counts`
  - `attention_items`
  - `attention_count`

3. RPC: `public.get_dispatcher_stats_summary(...)`
- Returns:
  - `current`
  - `previous`
  - `delta`
  - `series` (`created`, `handled`)
  - `range`

## Validation Scripts

- `tests/db/dispatcher/00_prereq_and_smoke.sql`
- `tests/db/dispatcher/10_explain_dispatcher_queue.sql`
- `tests/db/dispatcher/README.md`

## Run Order

1. Apply patch SQL
2. Run smoke checks
3. Run explain checks
4. Compare execution plans/timing against pre-patch baseline

