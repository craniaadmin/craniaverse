// Two outputs per run:
//   1. A daily log file at tests/logs/YYYY-MM-DD.log — every run
//      appends a one-line summary plus per-failure details.
//   2. If any test failed AND SendGrid + TEST_NOTIFY_EMAIL are
//      configured, an email to the operator summarizing what broke.

import fs from 'fs'
import path from 'path'
import sgMail from '@sendgrid/mail'
import {
  LOG_DIR, NOTIFY_EMAIL, NOTIFY_FROM, SENDGRID_KEY, BASE_URL,
} from '../config.js'

function logPath(now) {
  const d = now.toISOString().slice(0, 10) // YYYY-MM-DD
  return path.join(LOG_DIR, `${d}.log`)
}

function fmtSummary(summary, now) {
  const ts = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  return `[${ts}] total=${summary.total} pass=${summary.passed} fail=${summary.failed}`
}

function fmtFailures(summary) {
  return summary.results
    .filter(r => !r.passed)
    .map(r => `  ✗ ${r.name} — ${r.error}`)
    .join('\n')
}

export function writeLog(summary) {
  fs.mkdirSync(LOG_DIR, { recursive: true })
  const now = new Date()
  const lines = [fmtSummary(summary, now)]
  if (summary.failed > 0) {
    lines.push(fmtFailures(summary))
  }
  fs.appendFileSync(logPath(now), lines.join('\n') + '\n')
}

export async function sendFailureEmail(summary) {
  if (summary.failed === 0) return { skipped: true, reason: 'no failures' }
  if (!SENDGRID_KEY) return { skipped: true, reason: 'no SENDGRID_API_KEY' }
  if (!NOTIFY_EMAIL) return { skipped: true, reason: 'no TEST_NOTIFY_EMAIL' }

  sgMail.setApiKey(SENDGRID_KEY)

  const now = new Date()
  const subject = `[CraniaVerse tests] ${summary.failed} failure${summary.failed === 1 ? '' : 's'}`
  const failureBlock = summary.results
    .filter(r => !r.passed)
    .map(r => `• ${r.name}\n    ${r.error}\n    (${r.ms}ms)`)
    .join('\n\n')

  const text = [
    `Smoke tests against ${BASE_URL} failed.`,
    `Time:  ${now.toISOString()}`,
    `Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`,
    '',
    'Failures:',
    failureBlock,
    '',
    `Full log: tests/logs/${now.toISOString().slice(0, 10)}.log on maya-pc`,
  ].join('\n')

  try {
    await sgMail.send({ to: NOTIFY_EMAIL, from: NOTIFY_FROM, subject, text })
    return { sent: true }
  } catch (err) {
    console.error('[notify] email send failed:', err?.response?.body || err?.message || err)
    return { sent: false, error: err?.message || String(err) }
  }
}
