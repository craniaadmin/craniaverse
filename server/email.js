// ============================================================
// CraniaVerse — email notifications via SendGrid
// ------------------------------------------------------------
// Sends two emails on a successful registration:
//   1) Guardian receipt (to g1 + g2)
//   2) Internal registration record (to the location's mailbox)
// The "from" mailbox and the internal recipient are picked by
// the program's `location` field (Boardwalk vs Waterloo East).
// ============================================================
import sgMail from '@sendgrid/mail'

const API_KEY = process.env.SENDGRID_API_KEY
if (API_KEY) sgMail.setApiKey(API_KEY)

const LOCATIONS = {
  Boardwalk: {
    mailbox: 'boardwalk@crania-schools.com',
    name: 'Crania Schools — Boardwalk',
  },
  'Waterloo East': {
    mailbox: 'waterlooeast@crania-schools.com',
    name: 'Crania Schools — Waterloo East',
  },
}

const FALLBACK = {
  mailbox: 'info@crania-schools.com',
  name: 'Crania Schools',
}

const PHONE = '519-781-8810'
const INFO_EMAIL = 'info@crania-schools.com'

function pickLocation(form) {
  const programs = Array.isArray(form.programs) ? form.programs : []
  for (const p of programs) {
    if (p?.location && LOCATIONS[p.location]) return LOCATIONS[p.location]
  }
  if (form.location && LOCATIONS[form.location]) return LOCATIONS[form.location]
  return FALLBACK
}

function programSummary(form) {
  const programs = Array.isArray(form.programs) ? form.programs : []
  if (programs.length === 0 && form.program) {
    return `<li>${form.program}${form.day || form.time ? ' — ' + [form.day, form.time].filter(Boolean).join(' ') : ''}</li>`
  }
  return programs.map(p => {
    const parts = [p.program, p.schedule || [p.day, p.time].filter(Boolean).join(' '), p.location, p.platform]
      .filter(Boolean)
      .join(' — ')
    return `<li>${parts}</li>`
  }).join('') || '<li>(no program selected)</li>'
}

function guardianEmails(form) {
  const out = []
  if (form.g1Email) out.push({ email: form.g1Email, name: `${form.g1FirstName || ''} ${form.g1LastName || ''}`.trim() })
  if (form.g2Email && form.g2Email !== form.g1Email) {
    out.push({ email: form.g2Email, name: `${form.g2FirstName || ''} ${form.g2LastName || ''}`.trim() })
  }
  return out
}

function buildGuardianEmail(form, location) {
  const studentName = `${form.studentFirstName || ''} ${form.studentLastName || ''}`.trim() || 'your child'
  const guardianFirstName = form.g1FirstName || 'Guardian'

  const html = `
    <div style="font-family: Segoe UI, Helvetica, Arial, sans-serif; color: #1f2733; max-width: 600px;">
      <h2 style="color: #2c7a7b; font-family: Georgia, serif;">Registration Received</h2>
      <p>Hi ${guardianFirstName},</p>
      <p>Thank you for registering <strong>${studentName}</strong> with Crania Schools. We've received your registration and our team will be in touch shortly to confirm next steps.</p>

      <h3 style="color: #2c7a7b; margin-top: 24px;">Program(s) Selected</h3>
      <ul>${programSummary(form)}</ul>

      <h3 style="color: #2c7a7b; margin-top: 24px;">Payment Information</h3>
      <p>A reminder of how to complete payment:</p>
      <ul>
        <li>Pay the <strong>registration fee + first month's tuition</strong> by e-transfer to <a href="mailto:${INFO_EMAIL}">${INFO_EMAIL}</a>.</li>
        <li>After that, drop off a <strong>cheque for the entire year</strong> at your designated location (${location.name.replace('Crania Schools — ', '')}).</li>
      </ul>

      <h3 style="color: #2c7a7b; margin-top: 24px;">Questions?</h3>
      <p>If you need anything, please reach out:</p>
      <ul>
        <li>Phone: <a href="tel:${PHONE.replace(/-/g, '')}">${PHONE}</a></li>
        <li>Email: <a href="mailto:${INFO_EMAIL}">${INFO_EMAIL}</a></li>
      </ul>

      <p style="margin-top: 24px;">Warm regards,<br/>${location.name}</p>
    </div>
  `

  return {
    from: { email: location.mailbox, name: location.name },
    subject: `Registration received — ${studentName}`,
    html,
  }
}

function buildInternalEmail(form, record, location) {
  const studentName = record?.displayName || `${form.studentFirstName || ''} ${form.studentLastName || ''}`.trim()

  // Render the full form as a readable HTML table.
  const skip = new Set(['website']) // honeypot
  const rows = Object.entries(form)
    .filter(([k, v]) => !skip.has(k) && v != null && v !== '')
    .map(([k, v]) => {
      const val = typeof v === 'object' ? `<pre style="margin:0;font-family:Consolas,monospace;font-size:12px;">${escapeHtml(JSON.stringify(v, null, 2))}</pre>` : escapeHtml(String(v))
      return `<tr><td style="padding:6px 10px;border:1px solid #e3e8ec;font-weight:600;vertical-align:top;width:220px;">${escapeHtml(k)}</td><td style="padding:6px 10px;border:1px solid #e3e8ec;">${val}</td></tr>`
    })
    .join('')

  const html = `
    <div style="font-family: Segoe UI, Helvetica, Arial, sans-serif; color: #1f2733;">
      <h2 style="color: #2c7a7b; font-family: Georgia, serif;">New Registration — ${escapeHtml(studentName)}</h2>
      <p>A new registration was submitted for <strong>${escapeHtml(location.name)}</strong>.</p>
      <p><strong>Record ID:</strong> ${escapeHtml(record?.id || '(unknown)')}</p>

      <h3 style="color: #2c7a7b; margin-top: 24px;">Program(s)</h3>
      <ul>${programSummary(form)}</ul>

      <h3 style="color: #2c7a7b; margin-top: 24px;">Full Submission</h3>
      <table style="border-collapse:collapse;font-size:13px;">
        ${rows}
      </table>
    </div>
  `

  return {
    from: { email: location.mailbox, name: location.name },
    to: location.mailbox,
    subject: `New registration — ${studentName}`,
    html,
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function sendRegistrationEmails(form, record) {
  if (!API_KEY) {
    console.warn('[email] SENDGRID_API_KEY not set — skipping emails')
    return { skipped: true }
  }

  const location = pickLocation(form)
  const guardians = guardianEmails(form)

  const messages = []

  if (guardians.length > 0) {
    const base = buildGuardianEmail(form, location)
    messages.push({ ...base, to: guardians })
  } else {
    console.warn('[email] no guardian email on submission — skipping guardian email')
  }

  messages.push(buildInternalEmail(form, record, location))

  try {
    await Promise.all(messages.map(m => sgMail.send(m)))
    console.log(`[email] sent ${messages.length} message(s) for ${record?.id || form.studentFirstName}`)
    return { ok: true, sent: messages.length }
  } catch (err) {
    console.error('[email] send failed:', err?.response?.body || err.message || err)
    return { ok: false, error: err.message }
  }
}
