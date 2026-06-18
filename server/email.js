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
// Field-to-label mapping, grouped into sections that mirror the public
// registration form. Each section is rendered as its own card-style
// block; empty sections / empty fields are dropped.
const GUARDIAN1_FIELDS = [
  ['g1FirstName', 'First Name'],
  ['g1LastName', 'Last Name'],
  ['g1Relationship', 'Relationship'],
  ['g1PhoneMobile', 'Phone (Mobile)'],
  ['g1PhoneHome', 'Phone (Home)'],
  ['g1Email', 'Email'],
  ['g1Address1', 'Street Address'],
  ['g1Address2', 'Unit / Apt'],
  ['g1City', 'City'],
  ['g1Province', 'Province'],
  ['g1Postal', 'Postal Code'],
  ['g1Country', 'Country'],
  ['g1Occupation', 'Occupation'],
]
const GUARDIAN2_FIELDS = [
  ['g2FirstName', 'First Name'],
  ['g2LastName', 'Last Name'],
  ['g2Relationship', 'Relationship'],
  ['g2PhoneMobile', 'Phone (Mobile)'],
  ['g2PhoneHome', 'Phone (Home)'],
  ['g2Email', 'Email'],
  ['g2Address1', 'Street Address'],
  ['g2Address2', 'Unit / Apt'],
  ['g2City', 'City'],
  ['g2Province', 'Province'],
  ['g2Postal', 'Postal Code'],
  ['g2Country', 'Country'],
  ['g2Occupation', 'Occupation'],
]
const EMERGENCY_FIELDS = [
  ['emFirstName', 'First Name'],
  ['emLastName', 'Last Name'],
  ['emRelationship', 'Relationship'],
  ['emPhone', 'Phone'],
  ['emEmail', 'Email'],
]
const STUDENT_FIELDS = [
  ['studentFirstName', 'First Name'],
  ['studentLastName', 'Last Name'],
  ['gender', 'Gender'],
  ['dob', 'Date of Birth'],
  ['grade', 'Current Grade'],
  ['school', 'School'],
  ['studentEmail', 'Email'],
  ['medical', 'Medical Conditions'],
  ['reportCard', 'Report Card Provided'],
]
const PROGRAM_FIELDS = [
  ['program', 'Program'],
  ['day', 'Day'],
  ['time', 'Time'],
  ['schedule', 'Schedule'],
  ['location', 'Location'],
  ['platform', 'Learning Platform'],
  ['courseCost', 'Course Cost'],
  ['methodOfPayment', 'Method of Payment'],
  ['notes', 'Notes'],
]
const ADDITIONAL_FIELDS = [
  ['additionalNotes', 'Additional Notes'],
  ['hearAbout', 'How did you hear about us?'],
  ['enrollReasons', 'Reasons for Enrolling'],
  ['registeredJune', 'Registered in June'],
  ['usePrevMaterials', 'Use Previous Materials'],
  ['extraShirt', 'Extra Shirt'],
  ['receiveNews', 'Receive Newsletter'],
  ['agreeToS', 'Agreed to Terms of Service'],
  ['agreePhoto', 'Agreed to Photo Policy'],
]

function formatValue(v) {
  if (v === true) return 'Yes'
  if (v === false) return 'No'
  if (Array.isArray(v)) return v.length === 0 ? '' : v.join(', ')
  return String(v)
}

function hasValue(v) {
  if (v == null) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'boolean') return v === true // skip "No" booleans to keep emails uncluttered
  return true
}

function renderSection(title, fields, source) {
  const rows = fields
    .filter(([key]) => hasValue(source[key]))
    .map(([key, label]) => {
      const display = escapeHtml(formatValue(source[key]))
      return `<tr>
        <td style="padding:8px 12px;border:1px solid #e3e8ec;font-weight:600;vertical-align:top;width:220px;background:#fafbfc;">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border:1px solid #e3e8ec;">${display}</td>
      </tr>`
    })
    .join('')

  if (!rows) return ''

  return `
    <div style="margin: 0 0 24px;">
      <div style="background:#2c7a7b;color:#ffffff;padding:8px 14px;font-weight:700;font-size:14px;letter-spacing:.4px;text-transform:uppercase;border-radius:6px 6px 0 0;">${escapeHtml(title)}</div>
      <table style="border-collapse:collapse;font-size:13px;width:100%;">
        ${rows}
      </table>
    </div>
  `
}

function renderProgramsBlock(programs) {
  if (!Array.isArray(programs) || programs.length === 0) return ''

  const programBlocks = programs.map((p, i) => {
    const rows = PROGRAM_FIELDS
      .filter(([key]) => hasValue(p[key]))
      .map(([key, label]) => `<tr>
        <td style="padding:8px 12px;border:1px solid #e3e8ec;font-weight:600;vertical-align:top;width:200px;background:#fafbfc;">${escapeHtml(label)}</td>
        <td style="padding:8px 12px;border:1px solid #e3e8ec;">${escapeHtml(formatValue(p[key]))}</td>
      </tr>`)
      .join('')

    if (!rows) return ''

    return `
      <div style="margin: 0 0 16px; border:1px solid #d0e3e3; border-radius:6px; overflow:hidden;">
        <div style="background:#e7f2f2;color:#2c7a7b;padding:6px 12px;font-weight:700;font-size:13px;">Program ${i + 1}</div>
        <table style="border-collapse:collapse;font-size:13px;width:100%;">
          ${rows}
        </table>
      </div>
    `
  }).join('')

  if (!programBlocks) return ''

  return `
    <div style="margin: 0 0 24px;">
      <div style="background:#2c7a7b;color:#ffffff;padding:8px 14px;font-weight:700;font-size:14px;letter-spacing:.4px;text-transform:uppercase;border-radius:6px 6px 0 0;">Programs (${programs.length})</div>
      <div style="padding: 14px 0 0;">
        ${programBlocks}
      </div>
    </div>
  `
}

function hasAnyValue(fields, source) {
  return fields.some(([key]) => hasValue(source[key]))
}

function buildInternalEmail(form, record) {
  const studentName = record?.displayName || `${form.studentFirstName || ''} ${form.studentLastName || ''}`.trim() || 'New Student'
  const location = primaryLocation(form) || '—'
  const year = academicYearDisplay()

  const sections = []
  sections.push(renderSection('Guardian 1', GUARDIAN1_FIELDS, form))
  if (hasAnyValue(GUARDIAN2_FIELDS, form)) sections.push(renderSection('Guardian 2', GUARDIAN2_FIELDS, form))
  if (hasAnyValue(EMERGENCY_FIELDS, form)) sections.push(renderSection('Emergency Contact', EMERGENCY_FIELDS, form))
  sections.push(renderSection('Student', STUDENT_FIELDS, form))
  sections.push(renderProgramsBlock(form.programs))
  if (hasAnyValue(ADDITIONAL_FIELDS, form)) sections.push(renderSection('Additional Information', ADDITIONAL_FIELDS, form))

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #1f2733; max-width: 720px;">
      <h2 style="color: #2c7a7b; font-family: Georgia, serif; margin-bottom: 6px;">New Registration — ${escapeHtml(studentName)}</h2>
      <p style="color:#5b6573;margin-top:0;">
        ${escapeHtml(location)} &middot; Academic Year ${escapeHtml(year)} &middot; Record ID: ${escapeHtml(record?.id || '(unknown)')}
      </p>

      ${sections.filter(Boolean).join('')}
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
    messages.push({ ...base, to: guardians, cc: INTERNAL_RECIPIENT })
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
