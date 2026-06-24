// Shared config for the test runner. All values come from env so the
// same code works locally and under PM2 on maya-pc.

import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Tests reuse server/.env so SENDGRID_API_KEY and any other shared
// config lives in one place.
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') })

export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:4000'

// Where to email failures. If unset, email is skipped and failures
// only appear in the log file. The same SendGrid key as the
// registration emails is reused.
export const NOTIFY_EMAIL  = process.env.TEST_NOTIFY_EMAIL  || ''
export const NOTIFY_FROM   = process.env.TEST_NOTIFY_FROM   || 'registrations@crania-schools.com'
export const SENDGRID_KEY  = process.env.SENDGRID_API_KEY   || ''

// Page tests time out after this many ms per page.
export const PAGE_TIMEOUT_MS = Number(process.env.TEST_PAGE_TIMEOUT_MS) || 30000

export const LOG_DIR = path.join(__dirname, 'logs')
