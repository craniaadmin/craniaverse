// ============================================================
// CraniaVerse — email notifications via SendGrid
// ------------------------------------------------------------
// Sends two emails on a successful registration:
//   1) Guardian receipt (to g1 + g2) from registrations@crania-schools.com
//   2) Internal copy to registrations@crania-schools.com with the
//      entire submission as a readable table.
// ============================================================
import sgMail from '@sendgrid/mail'

// Read SENDGRID_API_KEY lazily (at send time, not import time). ES module
// imports evaluate before server.js's dotenv.config() call runs, so reading
// process.env at the top of this file would capture an empty value.
let sgConfigured = false
function ensureSgConfigured() {
  const key = process.env.SENDGRID_API_KEY
  if (!key) return false
  if (!sgConfigured) {
    sgMail.setApiKey(key)
    sgConfigured = true
  }
  return true
}

// ---- Single sender / internal recipient --------------------
const SENDER = {
  email: 'registrations@crania-schools.com',
  name: 'Crania Schools',
}
const INTERNAL_RECIPIENT = 'registrations@crania-schools.com'

// Link surfaced in the guardian email body. Override via env var when
// the marketing page is live.
const INFO_PAGE_URL =
  process.env.REGISTERED_STUDENTS_URL ||
  'https://www.crania-schools.com/registered-students'

// ---- helpers -----------------------------------------------
function academicYearDisplay(date) {
  const d = date || new Date()
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const start = month >= 8 ? year : year - 1
  return `${start}/${String(start + 1).slice(2)}` // e.g. "2025/26"
}

function primaryLocation(form) {
  const programs = Array.isArray(form.programs) ? form.programs : []
  for (const p of programs) {
    if (p?.location) return p.location
  }
  return form.location || ''
}

function guardianRecipients(form) {
  const out = []
  if (form.g1Email) out.push({ email: form.g1Email, name: `${form.g1FirstName || ''} ${form.g1LastName || ''}`.trim() })
  if (form.g2Email && form.g2Email.toLowerCase() !== (form.g1Email || '').toLowerCase()) {
    out.push({ email: form.g2Email, name: `${form.g2FirstName || ''} ${form.g2LastName || ''}`.trim() })
  }
  return out
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---- guardian email ----------------------------------------
function programDetailsBlock(form, studentName, fallbackLocation) {
  const programs = Array.isArray(form.programs) ? form.programs : []
  const rows = programs.length
    ? programs
    : [{ program: form.program || '', day: form.day || '', time: form.time || '', platform: form.platform || '', location: form.location || '' }]

  return rows.map(p => `
    <p style="margin:0 0 12px;">
      Student Name: <strong>${escapeHtml(studentName)}</strong><br/>
      Program: <strong>${escapeHtml(p.program || '')}</strong><br/>
      Day: <strong>${escapeHtml(p.day || '')}</strong><br/>
      Time: <strong>${escapeHtml(p.time || '')}</strong><br/>
      Learning Platform: <strong>${escapeHtml(p.platform || 'In-Person')}</strong><br/>
      Location: <strong>${escapeHtml(p.location || fallbackLocation || '')}</strong>
    </p>
  `).join('')
}

function buildGuardianEmail(form) {
  const studentFirst = form.studentFirstName || ''
  const studentLast = form.studentLastName || ''
  const studentName = `${studentFirst} ${studentLast}`.trim() || 'your child'
  const guardianFirst = form.g1FirstName || 'Guardian'
  const location = primaryLocation(form) || 'Crania Schools'
  const year = academicYearDisplay()

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1f2733; max-width: 640px;">
      <p>Dear ${escapeHtml(guardianFirst)},</p>

      <p>Thank you for registering ${escapeHtml(studentFirst || studentName)}. Your registration was successful and we have received your information.</p>

      <p>Please see our <a href="${escapeHtml(INFO_PAGE_URL)}">Information for Registered Students</a> page for useful information including payment options.</p>

      <p>Your registration details are below:</p>

      ${programDetailsBlock(form, studentName, location)}

      <hr style="border:none;border-top:1px solid #d0d4d8;margin:24px 0;" />

      <p style="text-align:center;">We look forward to seeing you soon, and welcome to the Crania Family!</p>

      <div style="text-align:center; margin-top: 16px;">
        <strong>Crania Schools</strong><br/>
        Central Village<br/>
        245 The Boardwalk, Suite 301<br/>
        Waterloo ON N2T 0A6<br/>
        1-833-3CRANIA<br/>
        519-781-8810<br/>
        <a href="https://www.crania-schools.com">www.crania-schools.com</a>
      </div>
    </div>
  `

  return {
    from: SENDER,
    subject: `Crania Schools Registration Confirmation - ${location} ${year}`,
    html,
  }
}

// ---- internal email ----------------------------------------
function buildInternalEmail(form, record) {
  const studentName = record?.displayName || `${form.studentFirstName || ''} ${form.studentLastName || ''}`.trim() || 'New Student'
  const location = primaryLocation(form) || '—'
  const year = academicYearDisplay()

  // Render the full form as a readable HTML table.
  const skip = new Set(['website']) // honeypot
  const rows = Object.entries(form)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== '')
    .map(([k, v]) => {
      const val =
        typeof v === 'object'
          ? `<pre style="margin:0;font-family:Consolas,monospace;font-size:12px;white-space:pre-wrap;">${escapeHtml(JSON.stringify(v, null, 2))}</pre>`
          : escapeHtml(String(v))
      return `<tr><td style="padding:6px 10px;border:1px solid #e3e8ec;font-weight:600;vertical-align:top;width:220px;background:#fafbfc;">${escapeHtml(k)}</td><td style="padding:6px 10px;border:1px solid #e3e8ec;">${val}</td></tr>`
    })
    .join('')

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1f2733;">
      <h2 style="color: #2c7a7b; font-family: Georgia, serif;">New Registration — ${escapeHtml(studentName)}</h2>
      <p>
        <strong>Location:</strong> ${escapeHtml(location)}<br/>
        <strong>Academic Year:</strong> ${escapeHtml(year)}<br/>
        <strong>Record ID:</strong> ${escapeHtml(record?.id || '(unknown)')}
      </p>

      <h3 style="color: #2c7a7b; margin-top: 24px;">Full Submission</h3>
      <table style="border-collapse:collapse;font-size:13px;">
        ${rows}
      </table>
    </div>
  `

  return {
    from: SENDER,
    to: INTERNAL_RECIPIENT,
    subject: `New registration — ${studentName} (${location} ${year})`,
    html,
  }
}

// ---- entry point -------------------------------------------
export async function sendRegistrationEmails(form, record) {
  if (!ensureSgConfigured()) {
    console.warn('[email] SENDGRID_API_KEY not set — skipping emails')
    return { skipped: true }
  }

  const guardians = guardianRecipients(form)
  const messages = []

  if (guardians.length > 0) {
    const base = buildGuardianEmail(form)
    messages.push({ ...base, to: guardians })
  } else {
    console.warn('[email] no guardian email on submission — skipping guardian email')
  }

  messages.push(buildInternalEmail(form, record))

  try {
    await Promise.all(messages.map(m => sgMail.send(m)))
    console.log(`[email] sent ${messages.length} message(s) for ${record?.id || form.studentFirstName}`)
    return { ok: true, sent: messages.length }
  } catch (err) {
    console.error('[email] send failed:', err?.response?.body || err.message || err)
    return { ok: false, error: err.message }
  }
}
