// ============================================================
// CraniaVerse backend — registration mapping + seed
// ------------------------------------------------------------
// Turns one flat registration payload (from the public form OR the
// in-app form) into ONE linked record: a Student (Students-page shape)
// and a Customer (Customers-page shape) under a shared id.
//
// This mirrors src/data/store.jsx so the admin app can drop the
// records straight into its pages with no extra transformation.
// ============================================================

export function ageFromDob(dob) {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return ''
  const years = (Date.now() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return years > 0 ? years.toFixed(2) : ''
}

function prettyDob(dob) {
  if (!dob) return ''
  const d = new Date(dob)
  if (isNaN(d.getTime())) return dob
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

let idCounter = 1
const newId = () => `reg-${Date.now()}-${idCounter++}`

function academicYear(date) {
  const d = date || new Date()
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const start = month >= 8 ? year : year - 1
  return `${String(start).slice(2)}_${String(start + 1).slice(2)}`
}

export function registrationToRecord(form) {
  const id = newId()
  const dobDisplay = prettyDob(form.dob)
  const age = ageFromDob(form.dob)

  const notes = []
  if (form.additionalNotes && form.additionalNotes.trim()) notes.push(form.additionalNotes.trim())
  if (form.program) notes.push(`Enrolled in: ${form.program}`)
  if (form.day || form.time) notes.push(`Schedule: ${[form.day, form.time].filter(Boolean).join(' ')}`)
  if (form.platform) notes.push(`Platform: ${form.platform}`)
  if (Array.isArray(form.enrollReasons) && form.enrollReasons.length) {
    notes.push(`Reason for enrolling: ${form.enrollReasons.join(', ')}`)
  }
  if (notes.length === 0) notes.push('New registration — no notes yet.')

  const student = {
    firstName: form.studentFirstName || '',
    lastName: form.studentLastName || '',
    gender: form.gender || '',
    dob: dobDisplay,
    age,
    email: form.studentEmail || '',
    grade: form.grade || '',
    school: form.school || '',
    medical: form.medical || '',
    notes,
    assessments: [],
    login: { username: '\u2014 generate \u2014', password: '\u2014 generate \u2014' },
    craniaCash: 0,
  }

  const customer = {
    student: {
      'First Name': form.studentFirstName || '',
      'Last Name': form.studentLastName || '',
      Gender: form.gender || '',
      DOB: dobDisplay,
      'Current Age': age,
      Email: form.studentEmail || '',
      'Current Grade': form.grade || '',
      School: form.school || '',
      'Report Card': form.reportCard ? 'link' : '',
      'Medical Conditions': form.medical || '',
    },
    guardian1: {
      'First Name': form.g1FirstName || '',
      'Last Name': form.g1LastName || '',
      Relationship: form.g1Relationship || '',
      'Phone (Home)': form.g1PhoneHome || '',
      'Phone (Mobile)': form.g1PhoneMobile || '',
      Email: form.g1Email || '',
      'Street Address': form.g1Address1 || '',
      Unit: form.g1Address2 || '',
      City: form.g1City || '',
      Province: form.g1Province || '',
      'Postal Code': form.g1Postal || '',
      Occupation: form.g1Occupation || '',
    },
    guardian2: {
      'First Name': form.g2FirstName || '',
      'Last Name': form.g2LastName || '',
      Relationship: form.g2Relationship || '',
      'Phone (Home)': form.g2PhoneHome || '',
      'Phone (Mobile)': form.g2PhoneMobile || '',
      Email: form.g2Email || '',
      'Street Address': form.g2Address1 || '',
      Unit: form.g2Address2 || '',
      City: form.g2City || '',
      Province: form.g2Province || '',
      'Postal Code': form.g2Postal || '',
      Occupation: form.g2Occupation || '',
    },
    emergency: {
      'First Name': form.emFirstName || '',
      'Last Name': form.emLastName || '',
      Relationship: form.emRelationship || 'Emergency Contact',
      'Phone (Mobile)': form.emPhone || '',
      Email: form.emEmail || '',
    },
  }

  const programs = (Array.isArray(form.programs) ? form.programs : [form.program ? { program: form.program, courseCost: form.courseCost } : null])
    .filter(Boolean)
    .map(prog => {
      let rate = '', rateUnit = ''
      if (prog.courseCost) {
        const parts = prog.courseCost.split('/')
        rate = parts[0].trim()
        rateUnit = parts[1] ? '/' + parts[1].trim() : ''
      }
      return {
        active: true, status: 'Active',
        year: academicYear(new Date()),
        program: prog.program || '',
        schedule: prog.schedule || [prog.day, prog.time].filter(Boolean).join(' '),
        platform: prog.platform || '',
        methodOfPayment: prog.methodOfPayment || '',
        rate, rateUnit,
        fees: {},
        payment: '',
      }
    })

  return {
    id,
    displayName: `${form.studentFirstName || ''} ${form.studentLastName || ''}`.trim() || 'New Student',
    createdAt: new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }),
    registration: form,
    programs,
    student,
    customer,
  }
}

// The seed record (same Hobo Karim demo data as the original app), so a
// freshly-started backend isn't empty.
export function makeSeedRecord() {
  return {
    id: 'seed',
    displayName: 'Hobo Karim',
    createdAt: 'Seed record',
    programs: [
      {
        active: false, status: 'Completed', year: '22_23', program: 'MATH ENRICHMENT LEVEL 3',
        rate: '$270', rateUnit: '/month',
        fees: { reg: 'paid', mat: 'paid', aug: 'paid', sep: 'paid', oct: 'paid', nov: 'paid', dec: 'paid', jan: 'paid', feb: 'paid', mar: 'paid', apr: 'paid', may: 'paid', jun: 'paid', jul: '' },
        payment: 'Paid',
      },
      {
        active: false, status: 'Completed', year: '22_23', program: 'SUMMER CAMP WEEK 1',
        rate: '$385', rateUnit: '/week',
        fees: { reg: 'paid', mat: 'paid', aug: 'paid', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '', jul: '' },
        payment: 'Overdue',
      },
      {
        active: true, status: 'Late Start', year: '25_26', program: 'MATH ENRICHMENT LEVEL 4',
        rate: '$279', rateUnit: '/month',
        fees: { reg: 'paid', mat: 'paid', aug: '', sep: 'paid', oct: 'paid', nov: 'paid', dec: 'paid', jan: 'paid', feb: 'paid', mar: 'paid', apr: 'paid', may: 'paid', jun: 'paid', jul: '' },
        payment: 'Paid',
      },
      {
        active: false, status: 'On-Hold', year: '25_26', program: 'MATH CONTEST CLUB',
        rate: '$279', rateUnit: '/month',
        fees: { reg: 'paid', mat: 'paid', aug: '', sep: 'paid', oct: 'paid', nov: 'paid', dec: 'paid', jan: 'paid', feb: 'paid', mar: 'paid', apr: 'paid', may: 'paid', jun: '', jul: '' },
        payment: 'Paid',
      },
      {
        active: false, status: 'Cancelled', year: '25_26', program: 'CROCHET CLUB',
        rate: '$10', rateUnit: '/lesson',
        fees: { reg: 'pending', mat: 'paid', aug: '', sep: '', oct: '', nov: '', dec: '', jan: '', feb: '', mar: '', apr: '', may: '', jun: '', jul: '' },
        payment: 'Pending',
      },
    ],
    student: {
      firstName: 'Hobo', lastName: 'Karim', gender: 'Female', dob: 'Dec 1, 2013',
      age: '12.25', email: 'student@school.ca', grade: '7', school: 'Cranius',
      medical: 'Overly cute',
      notes: [
        'Excellent student', 'Sometimes a little chatty', 'Eager to learn', 'Very smart',
        'Generally works well on her own', 'Ensure she doesn\u2019t fall asleep!', 'DOES NOT TAKE HOMEWORK!',
      ],
      assessments: [
        { name: 'MATH — YELLOW', date: 'Aug 1, 2026', score: '55%' },
        { name: 'ENGLISH — BLUE', date: 'Jul 3, 2026', score: '32%' },
      ],
      login: { username: '\u2014 generate \u2014', password: '\u2014 generate \u2014' },
      craniaCash: 45,
    },
    customer: {
      student: {
        'First Name': 'Hobo', 'Last Name': 'Karim', Gender: 'Female', DOB: 'Dec 1, 2013',
        'Current Age': '12.25', Email: 'student@school.ca', 'Current Grade': '7',
        School: 'Cranius', 'Report Card': 'link', 'Medical Conditions': 'Overly cute',
      },
      guardian1: {
        'First Name': 'Father', 'Last Name': 'Karim', Relationship: 'Dadders',
        'Phone (Home)': '(123) 456-7890', 'Phone (Mobile)': '(123) 456-7890',
        Email: 'father@kuber.com', 'Street Address': '7 Fun Lane', Unit: '',
        City: 'Waterloo', Province: 'Ontario', 'Postal Code': 'A1B 2C3', Occupation: 'Cool guy',
      },
      guardian2: {
        'First Name': 'Mother', 'Last Name': 'Karim', Relationship: 'Mummers',
        'Phone (Home)': '(123) 456-7890', 'Phone (Mobile)': '(123) 456-7890',
        Email: 'mother@kuber.com', 'Street Address': '7 Fun Lane', Unit: '',
        City: 'Waterloo', Province: 'Ontario', 'Postal Code': 'A1B 2C3', Occupation: '',
      },
      emergency: {
        'First Name': 'Chicken', 'Last Name': 'Licken', Relationship: 'Neighbour',
        'Phone (Mobile)': '(123) 456-7890', Email: 'chickens@next.ca',
      },
    },
  }
}
