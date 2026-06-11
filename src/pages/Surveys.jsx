import { useState } from 'react'
import { Check, Star } from 'lucide-react'

// ── Question definitions ────────────────────────────────────────────────────
const QUESTIONS = [
  // Q2
  {
    id: 2, type: 'radio',
    text: 'What is your age?',
    options: ['<30', '31–40', '41–50', '>50', 'Prefer not to answer'],
  },
  // Q3
  {
    id: 3, type: 'radio',
    text: 'What is your approximate average household income?',
    options: ['< $50,000', '$50,000 – $74,999', '$75,000 – $99,999',
      '$100,000 – $124,999', '$125,000 – $149,999', '> $150,000', 'Prefer not to answer'],
  },
  // Q4
  {
    id: 4, type: 'checkbox',
    text: 'What program(s) is your child enrolled in at Crania Schools?',
    note: 'Select all that apply.',
    options: ['Flex Math', 'Flex English', 'Math Enrichment', 'Teknokids (Robotics)',
      'Teknokids (Coding)', 'Piano', 'Private Lessons (Math)',
      'Private Lessons (Robotics)', 'Private Lessons (Coding)',
      'Not attending any programs at the moment'],
  },
  // Q5
  {
    id: 5, type: 'radio',
    text: 'As a previous, current, or future customer of Crania Schools, my expectations have:',
    options: ['Been Exceeded', 'Been Met', 'Almost Been Met', 'Been Somewhat Met', 'Not Been Met'],
  },
  // Q6
  {
    id: 6, type: 'radio',
    text: 'I believe the cost of Crania Schools is:',
    options: ['Below Average', 'Average', 'Above Average'],
  },
  // Q7
  {
    id: 7, type: 'radio',
    text: 'The value I receive from Crania Schools:',
    options: ['Is Above My Expectations', 'Meets My Expectations', 'Is Below My Expectations'],
  },
  // Q8
  {
    id: 8, type: 'radio',
    text: 'The schedule/hours offered by Crania Schools are:',
    options: ['Very Convenient', 'Moderately Convenient', 'Neither Convenient nor Inconvenient',
      'Moderately Inconvenient', 'Very Inconvenient'],
  },
  // Q9
  {
    id: 9, type: 'radio',
    text: 'The location of Crania Schools is:',
    options: ['Very Convenient', 'Moderately Convenient', 'Neither Convenient nor Inconvenient',
      'Moderately Inconvenient', 'Very Inconvenient'],
  },
  // Q10
  {
    id: 10, type: 'radio',
    text: 'I am _________ with the quality of the Crania Schools facility.',
    options: ['Very Satisfied', 'Moderately Satisfied', 'Neither Satisfied nor Dissatisfied',
      'Moderately Dissatisfied', 'Very Dissatisfied'],
  },
  // Q11
  {
    id: 11, type: 'radio',
    text: 'The attitude of the teachers at Crania Schools is:',
    options: ['Great', 'Good', 'Fair'],
  },
  // Q12
  {
    id: 12, type: 'textarea',
    text: 'Please share some comments about your overall experience, or any other thoughts you may have regarding Crania Schools:',
  },
  // Q13 — star rating
  {
    id: 13, type: 'stars',
    text: 'How would you rate Crania Schools overall?',
    required: true,
  },
]

const TOTAL_STEPS = QUESTIONS.length + 2 // intro + questions + thank-you

// ── Small components ────────────────────────────────────────────────────────

function Radio({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
      {options.map(o => (
        <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
          <input type="radio" checked={value === o} onChange={() => onChange(o)}
            style={{ accentColor: 'var(--btn-teal)', width: 16, height: 16 }} />
          {o}
        </label>
      ))}
    </div>
  )
}

function CheckboxGroup({ options, value = [], onChange }) {
  const toggle = (o) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginTop: 8 }}>
      {options.map(o => (
        <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)}
            style={{ accentColor: 'var(--btn-teal)', width: 16, height: 16 }} />
          {o}
        </label>
      ))}
    </div>
  )
}

function StarRating({ value, onChange }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star
          key={n}
          size={40}
          strokeWidth={1.5}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onClick={() => onChange(n)}
          style={{
            cursor: 'pointer',
            fill: n <= (hovered || value) ? '#f0a93a' : 'none',
            stroke: n <= (hovered || value) ? '#f0a93a' : '#c4ccd3',
            transition: 'fill .12s, stroke .12s',
          }}
        />
      ))}
    </div>
  )
}

function GoogleReviewPrompt() {
  return (
    <div style={{
      background: '#fff8e6', border: '1px solid #f0d28a', borderRadius: 10,
      padding: '18px 20px', marginTop: 18,
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>⭐ You gave us 5 stars — thank you!</div>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink-soft)' }}>
        Would you mind sharing that on Google? It helps other families find us.
      </p>
      <a
        href="https://www.google.com/search?q=crania+schools+google+review&oq=crania+schools+google+review&gs_lcrp=EgRlZGdlKgYIABBFGEAyBggAEEUYQDIHCAEQIRifBdIBCDY2NzhqMGo3qAIAsAIA&sourceid=chrome&ie=UTF-8#lrd=0x882bf661067db5cf:0x9a2d39595aaa9d83,1,,,,"
        target="_blank"
        rel="noopener noreferrer"
        className="btn"
        style={{ display: 'inline-block', textDecoration: 'none', fontSize: 13 }}
      >
        Leave a Google Review
      </a>
    </div>
  )
}

// ── Main survey component ───────────────────────────────────────────────────

export default function Surveys() {
  const [step, setStep] = useState(0)        // 0 = intro, 1..n = questions, n+1 = thank-you
  const [agreed, setAgreed] = useState(false)
  const [answers, setAnswers] = useState({})

  const qIndex = step - 1                     // index into QUESTIONS array
  const q = QUESTIONS[qIndex]
  const isIntro = step === 0
  const isDone = step > QUESTIONS.length
  const isLast = step === QUESTIONS.length

  const setAnswer = (id, val) => setAnswers(a => ({ ...a, [id]: val }))

  const canNext = () => {
    if (isIntro) return agreed
    if (!q) return true
    if (q.required && !answers[q.id]) return false
    return true
  }

  const handleNext = () => {
    if (isDone) return
    setStep(s => s + 1)
  }

  const handleBack = () => {
    if (step === 0) return
    setStep(s => s - 1)
  }

  const totalSteps = QUESTIONS.length + 1  // intro counts as step 0

  // ── Thank-you screen
  if (isDone) {
    return (
      <div className="page">
        <h2 className="page-title">Surveys</h2>
        <div className="card" style={{ maxWidth: 680, padding: '52px 48px', textAlign: 'center' }}>
          <div style={{
            width: 70, height: 70, borderRadius: '50%', background: '#e3f1f1',
            display: 'grid', placeItems: 'center', margin: '0 auto 20px',
            color: 'var(--btn-teal)', fontSize: 36, fontWeight: 800,
          }}>✓</div>
          <h3 style={{ fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 26, margin: '0 0 12px' }}>
            Thank you for your feedback!
          </h3>
          <p style={{ color: 'var(--ink-soft)', fontSize: 15, lineHeight: 1.7, maxWidth: 480, margin: '0 auto 20px' }}>
            We truly appreciate you taking the time to share your thoughts. Your responses help us
            continue improving the Crania Schools experience for every family.
          </p>
          {answers[13] === 5 && <GoogleReviewPrompt />}
          <button className="btn ghost" style={{ marginTop: 24 }} onClick={() => { setStep(0); setAnswers({}); setAgreed(false) }}>
            Start Over
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <h2 className="page-title">Surveys</h2>

      <div className="card" style={{ maxWidth: 780 }}>

        {/* Progress bar */}
        <div style={{ height: 5, background: 'var(--line)', borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--btn-teal)',
            width: `${(step / (QUESTIONS.length + 1)) * 100}%`,
            transition: 'width .3s',
          }} />
        </div>

        {/* Step indicator */}
        <div style={{ padding: '12px 24px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <span className="small muted">{isIntro ? 'Introduction' : `Question ${step} of ${QUESTIONS.length}`}</span>
        </div>

        {/* Body */}
        <div className="survey-body">

          {/* Intro */}
          {isIntro && (
            <>
              <p>Dear Parents,</p>
              <p>Thank you for taking the time to fill out this survey. We value your opinion! Complete your responses by <b>February 28, 2025</b> to be entered into a <b>draw for $100 OFF your next month</b> (if contact information is provided; draw date Mar 1, 2025).</p>
              <p>This survey is fully anonymous and personal data is completely optional. The survey should take <b>approximately three (3) minutes</b> to fill out, and we thank you again for taking the time out of your day.</p>
              <p>Responses will be used to enhance your experience at Crania Schools and may be used for Crania Schools publications.</p>
              <p>With gratitude,<br /><b>Crania Schools</b></p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: 'pointer', fontSize: 14 }}>
                <div className={'cbx' + (agreed ? ' checked' : '')} onClick={() => setAgreed(a => !a)}>
                  {agreed && <Check size={16} strokeWidth={3} />}
                </div>
                I understand the terms of the survey. <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
            </>
          )}

          {/* Questions */}
          {!isIntro && q && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--ink)' }}>
                {step}. {q.text}
                {q.required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
              </div>
              {q.note && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4 }}>{q.note}</div>}

              {q.type === 'radio' && (
                <Radio options={q.options} value={answers[q.id] || ''} onChange={v => setAnswer(q.id, v)} />
              )}
              {q.type === 'checkbox' && (
                <CheckboxGroup options={q.options} value={answers[q.id] || []} onChange={v => setAnswer(q.id, v)} />
              )}
              {q.type === 'textarea' && (
                <textarea
                  rows={5}
                  value={answers[q.id] || ''}
                  onChange={e => setAnswer(q.id, e.target.value)}
                  placeholder="Share your thoughts…"
                  style={{
                    width: '100%', marginTop: 8, padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 14,
                    resize: 'vertical', outline: 'none',
                  }}
                />
              )}
              {q.type === 'stars' && (
                <>
                  <StarRating value={answers[q.id] || 0} onChange={v => setAnswer(q.id, v)} />
                  {answers[13] === 5 && (
                    <div style={{ marginTop: 12, fontSize: 13, color: 'var(--btn-teal)', fontWeight: 600 }}>
                      ⭐ Amazing! You'll be invited to leave a Google review after submitting.
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
            <button className="btn ghost" onClick={handleBack} disabled={step === 0}
              style={{ opacity: step === 0 ? 0.4 : 1 }}>
              Back
            </button>
            <button
              className="btn"
              onClick={handleNext}
              disabled={!canNext()}
              style={{ opacity: canNext() ? 1 : 0.45 }}
            >
              {isLast ? 'Submit' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
