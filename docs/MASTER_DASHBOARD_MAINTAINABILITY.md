# Master Dashboard Maintainability Refactor (2026-02-08)

This document tracks the implemented maintainability changes for `MasterDashboard`.

## Implemented Items

1. Split domain rules/constants out of screen file  
File: `src/screens/master/constants/domain.js`

- Centralized tab, section, account view keys.
- Centralized order-status groups and urgency/status priorities.

2. Split payload normalization/mapping from UI  
File: `src/screens/master/mappers/orderMappers.js`

- Added `normalizeMasterOrder`.
- Added `normalizeMasterOrderList`.
- Dashboard now normalizes inbound data before storing in state.

3. Add route-backed web state for browser Back/Forward  
File: `src/screens/master/hooks/useMasterRouteState.js`

- Syncs `activeTab`, `orderSection`, `accountView` with URL query params.
- Supports browser `Back`/`Forward` using `popstate`.
- Works only on web; native platforms keep local state behavior.

6. Extract order filtering/sorting/counters into pure logic  
File: `src/screens/master/hooks/useMasterOrderProcessing.js`

- Added pure functions:
  - `filterPoolOrders`
  - `sortMyJobs`
  - `buildMasterCounters`
- Added hook wrapper `useMasterOrderProcessing`.
- Reduced business logic inside `MasterDashboard.js`.

7. Add unit tests for extracted pure logic  
Files:

- `tests/unit/masterOrderProcessing.test.js`
- `tests/unit/masterOrderMappers.test.js`

Coverage focus:

- filter correctness
- priority sorting correctness
- counter correctness
- mapper defaults + invalid-item filtering

9. Document the refactor and testing workflow  
Files:

- `docs/MASTER_DASHBOARD_MAINTAINABILITY.md` (this file)
- `tests/unit/README.md`

## Integration Notes

- `MasterDashboard.js` now imports:
  - `useMasterRouteState`
  - `useMasterOrderProcessing`
  - constants from `constants/domain.js`
  - mappers from `mappers/orderMappers.js`
- Hardcoded account-view comparisons were replaced by `ACCOUNT_VIEWS.*`.

