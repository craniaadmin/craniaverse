// One-shot test runner. PM2 invokes this on a cron schedule
// (see ecosystem.config.cjs craniaverse-tests entry); each fire
// runs every test once, writes a log line, optionally emails on
// failure, then exits.

import { summarize } from './framework.js'
import { runApiTests } from './api-tests.js'
import { runPageTests } from './page-tests.js'
import { runLogicTests } from './logic-tests.js'
import { writeLog, sendFailureEmail } from './utils/notify.js'
import { BASE_URL } from './config.js'

const started = Date.now()
console.log(`[tests] starting against ${BASE_URL}`)

const all = []
for (const [label, fn] of [
  ['api',   runApiTests],
  ['logic', runLogicTests],
  ['page',  runPageTests],
]) {
  try {
    const r = await fn()
    all.push(...r)
    const passed = r.filter(x => x.passed).length
    console.log(`[tests] ${label}: ${passed}/${r.length} passed`)
  } catch (err) {
    // A test suite itself blew up (e.g. Playwright couldn't launch).
    // Record as a failure so the run still reports cleanly.
    all.push({
      name: `${label} suite crashed`,
      passed: false,
      ms: 0,
      error: err?.message || String(err),
    })
    console.error(`[tests] ${label} suite crashed:`, err?.message || err)
  }
}

const summary = summarize(all)
writeLog(summary)

if (summary.failed > 0) {
  console.error('\n[tests] FAILURES:')
  for (const r of summary.results.filter(x => !x.passed)) {
    console.error(`  ✗ ${r.name}: ${r.error}`)
  }
  const mailResult = await sendFailureEmail(summary)
  if (mailResult.sent) {
    console.log('[tests] failure email sent')
  } else if (mailResult.skipped) {
    console.log(`[tests] email skipped (${mailResult.reason})`)
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1)
console.log(`[tests] done in ${elapsed}s · ${summary.passed}/${summary.total} passed`)
process.exit(summary.failed > 0 ? 1 : 0)
