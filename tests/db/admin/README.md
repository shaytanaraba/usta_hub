# Admin DB Tests

Run these in Supabase SQL Editor after applying:

- `data/PATCH_ADMIN_QUEUE_RPC_OPTIMIZATION.sql`

## Execution order

1. `tests/db/admin/00_prereq_and_smoke.sql`
2. `tests/db/admin/10_explain_admin_queue.sql`
3. `tests/db/admin/20_analysis_snapshot.sql`

## Expected outcomes

- Function `public.get_admin_orders_page` exists.
- Required queue indexes exist.
- RPC returns payload with:
  - `items`
  - `total_count`
  - `status_counts`
  - `attention_items`
  - `attention_count`
- EXPLAIN shows bounded LIMIT path for first-page queue read.

