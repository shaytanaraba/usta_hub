# Auth + Tab Sync Hardening (2026-02-11)

## Scope
This update hardens two weak areas that caused stale views and long idle recovery:

1. Admin tab data freshness and invalidation.
2. Auth refresh timeout/recovery behavior after idle.

The goal is to avoid "works only after browser reload" and reduce long "loading/stuck" windows after inactivity.

---

## 1) Admin Tab Freshness Architecture

### Before
- `ensureTabData(tab)` mostly acted like "load once per tab" via `loadedTabsRef`.
- If a tab had loaded once, later tab entries could skip fetches even when data changed elsewhere.
- Many mutations called `loadOrders()` without invalidating other tabs.  
  Example: create order from `create_order` tab refreshed queue but could leave analytics stale until full page reload.

### After
- Added a generic "dirty + stale TTL + single-flight" tab refresh policy in `AdminDashboard`.
- Any tab now refreshes on enter when:
  - it has never loaded,
  - it was marked dirty by a mutation,
  - or its TTL expired.

### Exact methods added/changed
- File: `src/screens/AdminDashboard.js`

1. Added tab policy constants and TTL config:
   - `ADMIN_TAB_KEYS`
   - `ADMIN_DEFAULT_TAB_STALE_TTL_MS`
   - `ADMIN_TAB_STALE_TTL_MS` (per tab)
   - helper: `parseMs`

2. Added runtime tab state refs:
   - `tabDirtyRef`
   - `tabLastLoadedAtRef`
   - `tabLoadInFlightRef`

3. Added policy helpers:
   - `markTabsDirty(tabKeys, reason)`
   - `shouldRefreshTab(tabKey, { force, reason })`
   - `getTabStaleTtlMs(tabKey)`

4. Upgraded `ensureTabData(tabKey, { force, reason })`:
   - checks freshness policy (not just loaded-once),
   - joins in-flight loads for same tab (single-flight),
   - records `tabLastLoadedAtRef`,
   - clears dirty flag after successful load.

5. Updated tab-enter refresh behavior:
   - effect now calls `ensureTabData(activeTab, { force: true, reason: 'tab_enter' })`.
   - clicking already-active sidebar tab triggers `ensureTabData(tab, { force: true, reason: 'tab_reselect' })`.

6. Upgraded order synchronization path:
   - `loadOrders({ forceQueue, reason })` now always refreshes both:
     - queue (`loadOrdersQueue`)
     - analytics order base (`loadAllOrders`)
   - marks `orders` and `analytics` tabs fresh.

7. Added mutation invalidation hooks:
   - Order mutations now mark `orders`, `analytics`, `people` dirty before syncing.
   - People/profile mutations mark `people`, `analytics`, `orders` dirty.
   - Settings dictionary/config mutations mark dependent tabs dirty.

8. Settings save integration:
   - `AdminSettingsTab` now accepts `onSettingsUpdated`.
   - On platform settings save, admin now invalidates dependent tabs (analytics/orders/create_order).

9. In-flight stale request hardening (post-idle reliability):
   - Added tab request control constants:
     - `ADMIN_TAB_LOAD_TIMEOUT_MS`
     - `ADMIN_TAB_INFLIGHT_STALE_MS`
     - `ADMIN_TAB_FORCE_JOIN_WINDOW_MS`
   - Added `tabLoadSeqRef` to version tab requests and ignore stale results.
   - `ensureTabData` now:
     - evicts old in-flight tab requests when they exceed allowed age,
     - allows short join window for rapid double-clicks,
     - applies hard timeout per tab load and keeps tab dirty when timeout occurs,
     - prevents stale tab-load completions from mutating load state.

10. Create-order eventual consistency guard (analytics/queue freshness):
   - Added `pendingCreatedOrdersRef` in admin screen to track just-created orders for a short window.
   - Added `mergePendingCreatedOrders()` that merges pending created rows into `getAllOrders()` result until backend reads include them.
   - `handleCreateOrder` now seeds an optimistic order into local `orders` state immediately on success.
   - This removes the "created order appears only after full browser reload" behavior when read-after-write is briefly delayed.

11. Analytics time-derived values auto-refresh:
   - Added a lightweight 60s tick while analytics tab is active.
   - `analyticsStats` / `analyticsLists` now re-compute on this tick so age-based metrics keep moving without manual refresh.

12. Full-order load stale-overwrite protection:
   - Added `ordersFullLoadSeqRef` request sequencing for admin full orders fetch.
   - If multiple `getAllOrders()` calls overlap, only the newest response is allowed to update `orders` state.
   - Older responses are logged as `orders_full_load_stale_ignored` and discarded.

13. Realtime orders sync + post-create read-confirm:
   - Added Supabase realtime channel subscription for `public.orders` in admin dashboard.
   - Realtime handler now:
     - marks `orders/analytics/people` tabs dirty,
     - debounces sync work,
     - reloads admin full orders list,
     - refreshes queue tab immediately when queue is the active view.
   - Added `confirmCreatedOrderPersisted(orderId)`:
     - retries lightweight `getOrderById` checks for a short bounded window,
     - promotes confirmed row into local state,
     - triggers targeted refresh only when needed.

---

## 2) Auth Idle-Recovery Hardening

### Before
- Refresh hard timeout default was `65000 ms`.
- Initial refresh timeout baseline was very high (up to `70000 ms`).
- Timeout hit limit was `3` before force-breaking stuck in-flight refresh.
- Dispatcher refresh path bypassed cached profile short-circuit and re-fetched profile aggressively.

### After
- Reduced auth timeout windows to fail/recover faster.
- Reduced stuck-refresh tolerance so deadlocks break earlier.
- Removed dispatcher-only cache bypass to reduce profile-fetch churn.

### Exact methods changed
- File: `src/contexts/AuthContext.js`

1. Constants updated:
   - `REFRESH_HARD_TIMEOUT_MS`: default `65000 -> 15000`
   - `INITIAL_REFRESH_TIMEOUT_MS`: default floor reduced to `22000`
   - `REFRESH_STUCK_TIMEOUT_HITS_LIMIT`: default `3 -> 1`
   - `PROFILE_REVALIDATE_MS`: default `10m -> 5m`

2. Refresh profile cache gate updated:
   - Removed dispatcher role exclusion in cached-user fast path.
   - Now same-user cache short-circuit applies uniformly by age/force rules.

---

## Why we switched (decision arguments)

1. From one-time tab load to policy-based refresh:
   - Old model optimized API calls but accepted stale UX.
   - New model balances correctness and load by refreshing only when dirty/stale.

2. From long auth hard-timeout to shorter fast-fail:
   - Old timeout kept UI in blocked/retry states too long after idle/network hiccups.
   - New timeout reduces "dead" wait windows and lets retry logic recover sooner.

3. From dispatcher profile always-revalidate behavior to shared TTL behavior:
   - Old behavior caused extra profile fetch churn and contributed to delayed first actions.
   - New behavior keeps consistency while reducing auth-path load.

---

## Potential issues introduced + mitigation

1. More requests when switching tabs:
   - Cause: stale TTL model may fetch more often than load-once.
   - Mitigation:
     - Tune per-tab TTL via env vars.
     - Keep single-flight joining to avoid duplicate concurrent tab loads.

2. More timeout toasts on weak networks:
   - Cause: shorter auth hard timeout.
   - Mitigation:
     - Increase `EXPO_PUBLIC_AUTH_REFRESH_HARD_TIMEOUT_MS` (e.g. 20-25s) if needed.
     - Keep diagnostics enabled while tuning.

3. Realtime channel availability depends on backend/policy health:
   - Cause: websocket disconnects, permissions, or transient network issues.
   - Mitigation:
      - fallback still exists via tab-enter/manual refresh,
      - diagnostics include realtime status/events for quick detection.

4. Heavy force refresh on manual actions:
   - Cause: manual refresh and tab-enter now intentionally bypass freshness checks.
   - Mitigation:
      - Keep service-level caches where safe (`authService` profile list cache, queue cache with TTL).
      - Tune inflight/timeout knobs for your network profile.

5. Stale in-flight request eviction may increase duplicate requests in bad networks:
   - Cause: when old in-flight exceeds stale threshold, a new request is launched.
   - Mitigation:
      - tune `EXPO_PUBLIC_ADMIN_TAB_INFLIGHT_STALE_MS` upward for very slow links.
      - keep `EXPO_PUBLIC_ADMIN_TAB_FORCE_JOIN_WINDOW_MS` small to avoid accidental spam.

6. Optimistic created-order merge can temporarily show a newly-created row before backend list confirms:
   - Cause: deliberate short-lived local optimism for read-after-write lag protection.
   - Mitigation:
      - pending row TTL is bounded.
      - once backend includes the order, pending entry is removed automatically.

7. Small background re-render every minute on analytics tab:
   - Cause: periodic tick for age metric freshness.
   - Mitigation:
      - interval runs only when analytics tab is active.

8. Post-create confirm retries add bounded extra reads:
   - Cause: deliberate read-confirm to close read-after-write window.
   - Mitigation:
      - retry count and delay are env-configurable and low by default.

---

## New/used config knobs

- Admin tab freshness:
  - `EXPO_PUBLIC_ADMIN_TAB_STALE_TTL_MS`
  - `EXPO_PUBLIC_ADMIN_ANALYTICS_STALE_TTL_MS`
  - `EXPO_PUBLIC_ADMIN_ORDERS_STALE_TTL_MS`
  - `EXPO_PUBLIC_ADMIN_PEOPLE_STALE_TTL_MS`
  - `EXPO_PUBLIC_ADMIN_SETTINGS_STALE_TTL_MS`
  - `EXPO_PUBLIC_ADMIN_CREATE_ORDER_STALE_TTL_MS`
  - `EXPO_PUBLIC_ADMIN_TAB_LOAD_TIMEOUT_MS`
  - `EXPO_PUBLIC_ADMIN_TAB_INFLIGHT_STALE_MS`
  - `EXPO_PUBLIC_ADMIN_TAB_FORCE_JOIN_WINDOW_MS`
  - `EXPO_PUBLIC_ADMIN_PENDING_CREATED_ORDER_TTL_MS`
  - `EXPO_PUBLIC_ADMIN_REALTIME_SYNC`
  - `EXPO_PUBLIC_ADMIN_REALTIME_DEBOUNCE_MS`
  - `EXPO_PUBLIC_ADMIN_REALTIME_MIN_INTERVAL_MS`
  - `EXPO_PUBLIC_ADMIN_CREATE_CONFIRM_RETRIES`
  - `EXPO_PUBLIC_ADMIN_CREATE_CONFIRM_DELAY_MS`

- Auth recovery:
  - `EXPO_PUBLIC_AUTH_REFRESH_HARD_TIMEOUT_MS`
  - `EXPO_PUBLIC_AUTH_INITIAL_TIMEOUT_MS`
  - `EXPO_PUBLIC_AUTH_TIMEOUT_HITS_LIMIT`
  - `EXPO_PUBLIC_AUTH_PROFILE_REVALIDATE_MS`

---

## Verification checklist

1. Create order from `create_order`, switch to `analytics`:
   - analytics should refresh without browser hard reload.

2. Leave tab idle, return, trigger refresh and queue interactions:
   - no long stuck spinner; either quick recovery or fast timeout + retry behavior.

3. Verify/unverify or edit staff profile:
   - `people` and dependent views update on next entry due dirty flags.

4. Save platform settings:
   - dependent tabs (`analytics`, `orders`, `create_order`) refresh on entry.
