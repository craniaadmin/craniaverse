// ============================================================
// PM2 cron job: watches the two ngrok tunnel processes (craniaverse-
// tunnel, craniaverse-signup-tunnel) and emails on down/recovery.
// ------------------------------------------------------------
// Why not just extend the smoke tests (tests/run.js)? Those hit
// BASE_URL, which defaults to http://localhost:4000 — the local
// Express app, not the public ngrok URL. On 2026-08-05 both tunnels
// crash-looped past ecosystem.config.cjs's max_restarts and sat
// "errored" for hours while the API answered locally the whole
// time, so the smoke tests stayed green and nobody was notified.
// This script checks PM2's own view of process health instead,
// which is what actually failed.
//
// Runs every 5 min via the craniaverse-tunnel-monitor PM2 entry
// (cron_restart, autorestart:false — see ecosystem.config.cjs).
// Only emails on a state *transition* (healthy -> down, down ->
// healthy), tracked in .tunnel-monitor-state.json next to this
// script, so a prolonged outage sends one alert, not one every 5
// minutes.
//
// Requires server/.env:
//   SENDGRID_API_KEY=...
//   TUNNEL_ALERT_EMAILS=info@crania-schools.com,anah.mirak@gmail.com
// ============================================================
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import sgMail from '@sendgrid/mail'

const execAsync = promisify(exec)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

const STATE_PATH = path.join(__dirname, '.tunnel-monitor-state.json')
const TRACKED_APPS = ['craniaverse-tunnel', 'craniaverse-signup-tunnel']

const SENDGRID_KEY = process.env.SENDGRID_API_KEY || ''
const ALERT_FROM = process.env.TUNNEL_ALERT_FROM || 'registrations@crania-schools.com'
const ALERT_TO = (process.env.TUNNEL_ALERT_EMAILS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
}

async function getPm2Status() {
  const { stdout } = await execAsync('pm2 jlist', { windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
  const list = JSON.parse(stdout)
  const byName = {}
  for (const proc of list) {
    if (TRACKED_APPS.includes(proc.name)) {
      byName[proc.name] = {
        status: proc.pm2_env?.status || 'unknown',
        restarts: proc.pm2_env?.restart_time ?? 0,
      }
    }
  }
  return byName
}

async function sendAlert(subject, text) {
  if (!SENDGRID_KEY || ALERT_TO.length === 0) {
    console.log(`[tunnel-monitor] email skipped (${!SENDGRID_KEY ? 'no SENDGRID_API_KEY' : 'no TUNNEL_ALERT_EMAILS'}): ${subject}`)
    return
  }
  sgMail.setApiKey(SENDGRID_KEY)
  try {
    await sgMail.send({ to: ALERT_TO, from: ALERT_FROM, subject, text })
    console.log(`[tunnel-monitor] alert sent: ${subject}`)
  } catch (err) {
    console.error('[tunnel-monitor] alert email failed:', err?.response?.body || err?.message || err)
  }
}

async function main() {
  const current = await getPm2Status()
  const prev = loadState()
  const now = new Date().toISOString()
  const nextState = {}

  for (const name of TRACKED_APPS) {
    const status = current[name]?.status || 'missing'
    const wasHealthy = prev[name]?.status === 'online'
    const isHealthy = status === 'online'
    const hadPriorReading = Boolean(prev[name])

    if (wasHealthy && !isHealthy) {
      console.error(`[tunnel-monitor] ${name} went DOWN (status=${status})`)
      await sendAlert(
        `[CraniaVerse] ${name} is DOWN`,
        `${name} is no longer online.\n\n` +
        `Status: ${status}\n` +
        `Restarts so far: ${current[name]?.restarts ?? 'n/a'}\n` +
        `Time: ${now}\n\n` +
        `Check with: pm2 describe ${name}\n` +
        `Restart with: pm2 restart ${name}`
      )
    } else if (hadPriorReading && !wasHealthy && isHealthy) {
      console.log(`[tunnel-monitor] ${name} RECOVERED`)
      await sendAlert(
        `[CraniaVerse] ${name} recovered`,
        `${name} is back online.\n\nTime: ${now}`
      )
    } else {
      console.log(`[tunnel-monitor] ${name}: ${status}`)
    }

    nextState[name] = { status, checkedAt: now }
  }

  saveState(nextState)
}

main().catch(err => {
  console.error('[tunnel-monitor] fatal:', err?.message || err)
  process.exit(1)
})
