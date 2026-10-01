# Tests

Browser tests that open the real `index.html` in headless Chromium (Playwright) with a pinned clock,
so they cover what a person actually sees and taps. No build step, no framework, no network.

## Run them

```sh
cd tests
npm install                       # once
npx playwright install chromium   # once (skip if you already have a Chromium)
npm test                          # runs every *.test.js
node timecard-rules.test.js       # or just one suite
```

Environment overrides (optional):

| Variable | Use |
|---|---|
| `CHROMIUM_PATH` | Use an existing Chromium binary instead of Playwright's download |
| `PLAYWRIGHT_PATH` | Path to an installed `playwright` package if it is not in `node_modules` |

## What each suite covers

| Suite | Covers |
|---|---|
| `timecard-rules.test.js` | Quarter-hour rounding, lunch, away blocks, holiday = 8.00H, PTO = the day's normal hours (8.25 Mon-Thu, 7.00 Fri), the Friday-holiday ripple, part-day PTO, unpaid shutdown, week dates, Reset Week |
| `planner-logic.test.js` | Balance projection, payday accrual, PTO cost per weekday, free holidays, Jan 1 rollover cap, overdraw warnings, the `setMode`/`getMode` contract the timecard relies on |
| `planner-ui.test.js` | Month pager, quick-pick month list, swipe, Calendar/Settings sub-tabs, red-month markers, narrow screens |
| `setup-sync.test.js` | First-launch setup and its validation, two-device sync (merge rules, links, undo), rejection of tampered codes, pre-sync plans |
| `behavior.test.js` | Blocked storage, week rollover while the app is open, new-week prompt, dialog focus, balance projection and editable plan dates |

## Notes for writing tests

- `helpers.js` has `openApp()` (fresh context, pinned clock, optional stored plan), `planWith()` (a set-up plan on top
  of the company holiday/shutdown calendar) and `gotoMonth()`.
- The app registers a service worker, which fails under `file://`; the helpers ignore that one error. Any other page
  error fails a test that checks `errors`.
- Fonts are blocked in tests (fallback fonts), so assert on text and structure, not pixel positions.
- A test that cannot fail is not worth keeping: when adding one, break the app on purpose once and confirm it goes red.
