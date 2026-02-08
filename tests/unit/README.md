# Unit Tests (Master Dashboard Refactor)

## Test Files

- `tests/unit/masterOrderProcessing.test.js`
- `tests/unit/masterOrderMappers.test.js`

## What These Tests Validate

- `masterOrderProcessing.test.js`
  - pool filtering by `urgency/service/area/pricing`
  - my-jobs sorting priority logic
  - dashboard counters (`active`, `immediate`, `started`, `pending`)

- `masterOrderMappers.test.js`
  - mapper defaults for partial payloads
  - invalid list-item removal

## How To Run

The repository currently does not include a configured JS unit-test runner in `package.json`.

Recommended setup:

```bash
npm install --save-dev jest jest-expo
```

Add script in `package.json`:

```json
{
  "scripts": {
    "test": "jest tests/unit --runInBand"
  }
}
```

Run:

```bash
npm run test
```

## How To Analyze Results

- If `filterPoolOrders` tests fail:
  - verify filter key mapping: `service -> service_type`, `pricing -> pricing_type`
  - verify `'all'` fallback logic

- If `sortMyJobs` tests fail:
  - verify status priority order:
    - `started`
    - `claimed`
    - `completed`
  - verify urgency ranking for claimed orders:
    - `emergency`
    - `urgent`
    - `planned`

- If mapper tests fail:
  - verify fallback values for:
    - `status`
    - `urgency`
    - `service_type`
    - `pricing_type`
  - verify invalid rows (no `id`) are filtered out

