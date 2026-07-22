# Continuous smoke tests

A small Node + Playwright test runner that PM2 fires every 15 minutes
against the live API and the headless-rendered React app. On failure
it appends to `tests/logs/<date>.log` and emails the operator (if
SendGrid + `TEST_NOTIFY_EMAIL` are configured).

## What it tests

- **api-tests.js** — every `/api/*` endpoint returns the expected shape
  (registrations, staff, programs, rules, staff-board, comments, health,
  unknown-route 404).
- **logic-tests.js** — full round-trips: POST a fake registration
  (named `PB-Test <tag>`), verify it appears in GET, DELETE it, verify
  it's gone. Plus a cash-entry round-trip and a programs shape check.
  Every test cleans up after itself, and the registration test also
  **self-heals**: it deletes any leftover `PB-Test` records at the
  start of each run, so an interrupted or failed cleanup can never
  accumulate junk in the live Students/Customers lists.

## Cleaning up leftover test records

If the live database has accumulated old `PB-Test …` registrations
(e.g. from before the self-healing fix), sweep them directly against
PocketBase — run on maya-pc where PocketBase lives:

```powershell
cd C:\Users\CraniaVerse\craniaverse\server
npm run cleanup-test-records          # dry run — lists what would be deleted
npm run cleanup-test-records -- --apply   # actually delete them
```

It only matches registrations whose student first name is exactly
`PB-Test`, so real families are never touched. (The next scheduled test
run would also sweep these automatically, but this gives an immediate,
inspectable purge.)
- **page-tests.js** — Playwright headless Chromium signs in, then
  clicks each top-nav item and verifies the page renders with no
  uncaught console errors.

## One-time setup on maya-pc

```powershell
cd C:\Users\CraniaVerse\craniaverse\tests
npm install
npx playwright install chromium
```

Then add to `server/.env`:

```
TEST_NOTIFY_EMAIL=you@example.com
```

(Leave blank to skip email; logs still get written.)

Then have PM2 pick up the new app:

```powershell
cd C:\Users\CraniaVerse\craniaverse
pm2 reload ecosystem.config.cjs
pm2 save
```

Confirm the schedule is registered:

```powershell
pm2 describe craniaverse-tests
```

You should see `cron restart: */15 * * * *`.

## Running on demand

```powershell
cd C:\Users\CraniaVerse\craniaverse\tests
npm test
```

Exits 0 if everything passes, 1 if anything fails.

## Where the output lives

- `tests/logs/YYYY-MM-DD.log` — one append per run, plus per-failure
  detail when something breaks.
- `pm2 logs craniaverse-tests` — most recent run's stdout/stderr.
- Email — sent only when at least one test fails and the env vars
  above are set.

## Adjusting the schedule

Edit the `cron_restart` field on the `craniaverse-tests` block in
`ecosystem.config.cjs` and run `pm2 reload ecosystem.config.cjs`.
Common settings:

- `*/5 * * * *` — every 5 minutes
- `*/15 * * * *` — every 15 minutes (default)
- `0 * * * *` — once an hour
- `0 9-17 * * *` — once an hour, only during the day

## Adding a new test

Drop another `runTest('name', async () => { ... })` into
`api-tests.js`, `logic-tests.js`, or `page-tests.js`. The runner picks
it up automatically — no registration needed.
