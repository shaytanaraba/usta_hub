# Admin Dashboard Optimization

Last updated: 2026-02-08

## What was optimized

1. Admin queue moved to paged server flow (`get_admin_orders_page`) with fallback.
2. Queue requests now support request dedupe/in-flight reuse in `ordersService`.
3. Initial admin load changed from "load everything" to staged tab loading.
4. Orders tab now fetches paged queue data instead of filtering full in-memory order list.
5. Queue search is debounced via `useDebouncedValue`.
6. Refresh now reloads only the active tab data.
7. Earnings service logs are env-gated (`EXPO_PUBLIC_ENABLE_EARNINGS_LOGS=1`).
8. Duplicate `getPlatformSettings` implementation in `ordersService` removed.

## Files changed

- `src/screens/AdminDashboard.js`
- `src/screens/admin/hooks/useDebouncedValue.js`
- `src/services/orders.js`
- `src/services/earnings.js`
- `data/PATCH_ADMIN_QUEUE_RPC_OPTIMIZATION.sql`
- `tests/db/admin/00_prereq_and_smoke.sql`
- `tests/db/admin/10_explain_admin_queue.sql`
- `tests/db/admin/20_analysis_snapshot.sql`

## DB run order

1. Run patch:
```sql
\i data/PATCH_ADMIN_QUEUE_RPC_OPTIMIZATION.sql
```

2. Run smoke checks:
```sql
\i tests/db/admin/00_prereq_and_smoke.sql
```

3. Run explain checks:
```sql
\i tests/db/admin/10_explain_admin_queue.sql
```

4. Run snapshot:
```sql
\i tests/db/admin/20_analysis_snapshot.sql
```

## How to analyze results

1. `00_prereq_and_smoke.sql`
- Confirm function `get_admin_orders_page` exists.
- Confirm all 4 indexes exist.
- Confirm payload contains:
  - `items` (array)
  - `total_count` (number)
  - `status_counts` (object with Active/Payment/Confirmed/Canceled)
  - `attention_items` (array)
  - `attention_count` (number)

2. `10_explain_admin_queue.sql`
- Target outcome:
  - bounded scan on first page request (`LIMIT 20` path)
  - no unbounded full-table sort for routine queue access
- If planner still chooses sequential scans on tiny datasets, that is acceptable.

3. `20_analysis_snapshot.sql`
- Use as baseline before/after load testing.
- Track index size growth and queue-status distribution.

## Frontend perf targets

Targets for admin page (web):

- First interactive paint of active tab: <= 2.0s on warm backend
- Orders tab filter/search response: <= 700ms
- Queue page switch (same filter set): <= 500ms
- Pull-to-refresh active tab: <= 1.5s

## Optional debug env flags

Set to `1` only while profiling:

- `EXPO_PUBLIC_ENABLE_PERF_LOGS`
- `EXPO_PUBLIC_ENABLE_ORDERS_LOGS`
- `EXPO_PUBLIC_ENABLE_AUTH_LOGS`
- `EXPO_PUBLIC_ENABLE_EARNINGS_LOGS`

## Post-Optimization Fixes (2026-02-08)

### 1) Service Type sidebar controlled input warning

- Symptom:
  - React warning: changing uncontrolled input to controlled in service-type editor.
- Root cause:
  - Form state fields could be `undefined` before modal state hydration.
- Implemented fix:
  - initialized `tempServiceType` with full string defaults
  - modal-open state now merges against a base object
  - text input `value` props normalized with `|| ''`
- Files:
  - `src/screens/AdminDashboard.js`

### 2) Cancellation Reason Kyrgyz field support

- Added `name_kg` input in Cancellation Reason editor in Settings.
- Added `name_kg` to save/update payload in admin actions.
- File:
  - `src/screens/AdminDashboard.js`

### 3) Sidebar language display

- Replaced language abbreviation text with flags in admin sidebar language chip.
- File:
  - `src/screens/AdminDashboard.js`

### 4) DB alignment requirement (important)

- If `public.cancellation_reasons` does not have `name_kg`, apply DB migration first.
- If `get_active_cancellation_reasons(text)` already exists, changing return columns requires:
  - `DROP FUNCTION ...` then `CREATE FUNCTION ...`
  - direct `CREATE OR REPLACE` will fail with `ERROR 42P13`.
- Full SQL snippet is documented in:
  - `data/DATABASE_DOCUMENTATION.md`
