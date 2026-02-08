# Dispatcher Dashboard Optimization (2026-02-08)

This document describes the implemented optimization pass for `DispatcherDashboard`.

## Scope

Primary goals:

1. Faster queue load and filter response
2. Better scalability with growing order volume
3. More stable UX during frequent actions
4. Better maintainability and observability

## Implemented Changes

### 1) Server-side queue pagination/filtering/sorting

Files:

- `src/services/orders.js`
- `data/PATCH_DISPATCHER_QUEUE_RPC_OPTIMIZATION.sql`

What changed:

- Added service method `getDispatcherOrdersPage(...)`
- Added DB RPC `public.get_dispatcher_orders_page(...)` returning:
  - `items`
  - `total_count`
  - `status_counts`
  - `attention_items`
  - `attention_count`
- Added fallback to legacy client-side flow when RPC is unavailable

Technical reason:

- Avoid loading all dispatcher orders and re-filtering/sorting in JS.

Expected effect:

- Lower payload size and CPU on queue tab.
- More stable list performance as dataset grows.

### 2) Action path: optimistic local updates + background refresh

Files:

- `src/screens/dispatcher/hooks/useDispatcherActions.js`
- `src/screens/DispatcherDashboard.js`

What changed:

- Added `patchOrderInState`, `removeOrderFromState`, `addOrderToState`
- Replaced direct `await loadData()` after actions with:
  - immediate state update
  - scheduled background queue refresh

Technical reason:

- Full reload after every mutation causes repeated latency spikes and UI blocking.

Expected effect:

- Faster perceived response after assign/transfer/payment/edit/cancel/reopen actions.

### 3) Auth fetch reduction

Files:

- `src/screens/dispatcher/hooks/useDispatcherDataLoader.js`

What changed:

- Data loader resolves user from `authUser` first.
- Calls `authService.getCurrentUser` only as fallback.

Technical reason:

- Removes redundant profile fetch on each queue reload.

Expected effect:

- Lower reload latency and backend calls.

### 4) Debounced filter-driven reload

Files:

- `src/screens/dispatcher/hooks/useDebouncedValue.js`
- `src/screens/DispatcherDashboard.js`

What changed:

- Added debounced search value (`220ms`) for queue query reloads.

Technical reason:

- Prevent one request per keystroke in search input.

Expected effect:

- Smoother typing and fewer network bursts.

### 5) FlatList virtualization tuning

File:

- `src/screens/DispatcherDashboard.js`

What changed:

- Added:
  - `initialNumToRender={10}`
  - `maxToRenderPerBatch={8}`
  - `windowSize={7}`
  - `updateCellsBatchingPeriod={40}`
  - `removeClippedSubviews` on non-web

Technical reason:

- Better batching and memory behavior for mixed card/list modes.

Expected effect:

- More stable scroll performance and reduced frame drops.

### 6) Metadata caching with TTL

Files:

- `src/screens/dispatcher/utils/metadataCache.js`
- `src/screens/dispatcher/hooks/useDispatcherDataLoader.js`

What changed:

- Cached low-churn data sets:
  - service types
  - districts
  - dispatchers
  - platform settings
  - masters

Technical reason:

- Avoid repeated startup requests for mostly static data.

Expected effect:

- Faster cold/warm screen start and reduced backend pressure.

### 7) Stats aggregation moved to DB RPC path

Files:

- `src/services/orders.js`
- `data/PATCH_DISPATCHER_QUEUE_RPC_OPTIMIZATION.sql`

What changed:

- Added service method `getDispatcherStatsSummary(...)`
- Added DB RPC `public.get_dispatcher_stats_summary(...)`
- Kept fallback aggregation in app service when RPC missing

Technical reason:

- Prevent large client-side stats scans and multi-pass array processing.

Expected effect:

- Faster stats-tab load and consistent performance for large history.

### 8) Perf instrumentation

Files:

- `src/screens/dispatcher/hooks/useDispatcherPerf.js`
- `src/screens/dispatcher/hooks/useDispatcherDataLoader.js`
- `src/services/orders.js`

What changed:

- Added `[DispatcherDashboard][PERF]` and `[OrdersService][PERF]` logs for:
  - queue load start/end
  - metadata fetch timings
  - stats load timing
  - RPC/fallback source

Technical reason:

- Needed for regression detection and evidence-based tuning.

Expected effect:

- Easier diagnosis of real bottlenecks and post-release monitoring.

### 9) Maintainability split and stale-load safety

Files:

- `src/screens/dispatcher/hooks/useDispatcherUiState.js`
- `src/screens/dispatcher/hooks/useDispatcherOrderActions.js`
- `src/screens/dispatcher/components/tabs/DispatcherCreateOrderTab.js`
- `src/screens/dispatcher/components/tabs/DispatcherSettingsTab.js`
- `src/screens/dispatcher/styles/dashboardStyles.js`
- `src/screens/dispatcher/hooks/useDispatcherDataLoader.js`

What changed:

- Moved large create/settings tab JSX out of `DispatcherDashboard.js`.
- Moved dispatcher style map into a dedicated styles module.
- Centralized UI state transitions in reducer-backed hook.
- Centralized order actions in dedicated action hook.
- Added load-id stale-response guards for queue/stats loaders.

Technical reason:

- Reduces screen-level blast radius and makes future changes/testability easier.
- Prevents async race conditions where older responses can overwrite newer state.

Expected effect:

- Smaller, easier-to-maintain dashboard composition file.
- Lower risk of regressions when extending create/settings flows.
- More stable UI under rapid filter/page changes.

### 10) Log volume controls

Flags:

- `EXPO_PUBLIC_ENABLE_PERF_LOGS=1`
- `EXPO_PUBLIC_ENABLE_DISPATCHER_LOGS=1`
- `EXPO_PUBLIC_ENABLE_ORDERS_LOGS=1`

Notes:

- Dispatcher perf/info logs are now env-gated.
- `OrdersService` verbose `console.log` traffic is disabled by default and enabled only by flag.

## DB Validation & Test Scripts

Validation files:

- `tests/db/dispatcher/00_prereq_and_smoke.sql`
- `tests/db/dispatcher/10_explain_dispatcher_queue.sql`
- `tests/db/dispatcher/README.md`

Run order:

1. Apply DB patch `data/PATCH_DISPATCHER_QUEUE_RPC_OPTIMIZATION.sql`
2. Run smoke checks
3. Run explain checks and compare plans/timing

## Notes

- Service methods include fallback to legacy flows if RPCs are not yet deployed.
- For full optimization benefit, DB patch must be applied in Supabase.
