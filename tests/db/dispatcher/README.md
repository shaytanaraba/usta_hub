# Dispatcher DB Optimization Tests

These scripts validate dispatcher queue/stats DB optimizations from:

- `data/PATCH_DISPATCHER_QUEUE_RPC_OPTIMIZATION.sql`

## Files

- `tests/db/dispatcher/00_prereq_and_smoke.sql`
  - Confirms indexes and RPC functions exist
  - Runs basic queue/stats RPC smoke calls
- `tests/db/dispatcher/10_explain_dispatcher_queue.sql`
  - Captures explain plans for RPC and equivalent base query

## How To Run

1. Apply patch in Supabase SQL editor:
```sql
\i data/PATCH_DISPATCHER_QUEUE_RPC_OPTIMIZATION.sql
```

2. Run smoke checks:
```sql
\i tests/db/dispatcher/00_prereq_and_smoke.sql
```

3. Run explain checks:
```sql
\i tests/db/dispatcher/10_explain_dispatcher_queue.sql
```

If your SQL editor does not support `\i`, copy and run file contents directly.

## How To Analyze Results

1. `00_prereq_and_smoke.sql`
- All expected index names should be present.
- Both RPC names should be present.
- `queue_payload` should include:
  - `items` (array)
  - `total_count` (number)
  - `status_counts` (object)
  - `attention_items` and `attention_count`
- `stats_payload` should include:
  - `current`, `previous`, `delta`, `series`, `range`

2. `10_explain_dispatcher_queue.sql`
- Prefer seeing index scans/bitmap index scans on dispatcher scope indexes.
- `LIMIT 20` query should not show large sort memory or full-table scans under normal data distribution.
- Compare runtime before/after patch. Target direction:
  - lower total time
  - fewer buffers read
  - predictable latency as orders grow

## Notes

- RPCs are `SECURITY DEFINER` and depend on `auth.uid()`.  
  Scripts set JWT claim context with `set_config(...)` for local smoke runs.
- If data volume is tiny, planner may still choose sequential scan; rerun with production-like volume for realistic plans.

