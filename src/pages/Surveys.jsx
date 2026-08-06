// Surveys — a list/builder layer (same idea as Forms.jsx) in front of
// the original single hardcoded Family Feedback Survey, which now
// lives as the first "built-in" row in the /api/surveys collection —
// still editable/deletable like any other survey, just always present
// on first boot. Staff can now add as many additional surveys as they
// want, each with its own questions (radio/checkbox/textarea/star
// rating), take them right here in the app (no public URL — a staff
// member hands a tablet to the family, same as before), and review
// responses per survey.
import { useState, useEffect } from 'react'
import { Plus, X, Edit2, Eye, ChevronLeft, Trash2, GripVertical, Check, Star, Download } from 'lucide-react'
import PageActions from '../components/PageActions'

const API_BASE = import.meta.env?.VITE_API_URL || ''

const QUESTION_TYPES = [
  { value: 'radio',    label: 'Multiple choice (one answer)' },
  { value: 'checkbox', label: 'Checkboxes (select all)' },
  { value: 'textarea', label: 'Long text' },
  { value: 'stars',    label: 'Star rating (1–5)' },
]
const HAS_OPTIONS = new Set(['radio', 'checkbox'])

const genKey = () => 'q_' + Math.random().toString(36).slice(2, 8)
const BLANK_QUESTION = () => ({ id: genKey(), type: 'radio', text: '', note: '', required: false, options: [] })
const BLANK_SURVEY = { title: '', intro: '', questions: [] }

// ------------------------------ small fill-out components ------------------------------
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
    <div style={{ background: '#fff8e6', border: '1px solid #f0d28a', borderRadius: 10, padding: '18px 20px', marginTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>⭐ You gave us 5 stars — thank you!</div>
      <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--ink-soft)' }}>
        Would you mind sharing that on Google? It helps other families find us.
      </p>
      <a
        href="https://www.google.com/search?q=crania+schools+google+review&oq=crania+schools+google+review&gs_lcrp=EgRlZGdlKgYIABBFGEAyBggAEEUYQDIHCAEQIRifBdIBCDY2NzhqMGo3qAIAsAIA&sourceid=chrome&ie=UTF-8#lrd=0x882bf661067db5cf:0x9a2d39595aaa9d83,1,,,,"
        target="_blank" rel="noopener noreferrer" className="btn"
        style={{ display: 'inline-block', textDecoration: 'none', fontSize: 13 }}
      >
        Leave a Google Review
      </a>
    </div>
  )
}

// ------------------------------ SURVEYS LIST ------------------------------
function SurveysList({ surveys, respCounts, onNew, onTake, onEdit, onDelete, onOpenSubs }) {
  return (
    <div className="page">

      <PageActions
        csvName="crania-surveys"
        csvColumns={[
          { key: 'title', label: 'Survey' },
          { key: 'questions', label: 'Questions' },
          { key: 'responses', label: 'Responses' },
          { key: 'description', label: 'Description' },
        ]}
        csvRows={() => surveys.map(s => ({
          title: s.title || 'Untitled Survey',
          questions: (s.questions || []).length,
          responses: respCounts[s.id] || 0,
          description: s.description || '',
        }))}
        backupCollection="surveys"
        backupHint="Snapshots of every survey definition (last 14 kept). Responses are not included."
      >
        <button className="icon-btn solid" title="New survey" onClick={onNew}>
          <Plus size={22} />
        </button>
        <button title="Build a new survey" onClick={onNew}><Plus size={13} /> New Survey</button>
      </PageActions>

      <div style={{ display: 'grid', gap: 12 }}>
        {surveys.length === 0 ? (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: 15, marginBottom: 6 }}>No surveys yet.</div>
            <div style={{ fontSize: 13 }}>Click <b>+</b> above to build one.</div>
          </div>
        ) : surveys.map((s) => (
          <div key={s.id} style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
            padding: '16px 18px', display: 'grid', gridTemplateColumns: '1fr auto',
            gap: 12, alignItems: 'center', boxShadow: '0 1px 3px rgba(20,30,45,.06)',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                {s.id === 'survey-family-feedback' && <Star size={15} style={{ color: '#5FA09E', fill: '#5FA09E' }} />}
                {s.title || 'Untitled Survey'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>{(s.questions || []).length} question{(s.questions || []).length === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>{respCounts[s.id] || 0} response{(respCounts[s.id] || 0) === 1 ? '' : 's'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="icon-btn" title="Take this survey" onClick={() => onTake(s.id)}>
                <Check size={16} />
              </button>
              <button className="icon-btn" title="View responses" onClick={() => onOpenSubs(s.id)}>
                <Eye size={16} />
              </button>
              <button className="icon-btn" title="Edit survey" onClick={() => onEdit(s.id)}>
                <Edit2 size={16} />
              </button>
              <button className="icon-btn" title="Delete survey" onClick={() => {
                if (confirm(`Delete "${s.title || 'Untitled Survey'}"? All responses will also be deleted.`)) onDelete(s.id)
              }}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ------------------------------ BUILDER ------------------------------
function SurveyBuilder({ initial, onSave, onCancel }) {
  const [survey, setSurvey] = useState(initial || BLANK_SURVEY)
  const [saving, setSaving] = useState(false)

  const setQuestion = (idx, patch) => {
    setSurvey(s => ({ ...s, questions: s.questions.map((q, i) => i === idx ? { ...q, ...patch } : q) }))
  }
  const addQuestion = () => setSurvey(s => ({ ...s, questions: [...s.questions, BLANK_QUESTION()] }))
  const removeQuestion = (idx) => setSurvey(s => ({ ...s, questions: s.questions.filter((_, i) => i !== idx) }))
  const moveQuestion = (idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= survey.questions.length) return
    setSurvey(s => {
      const next = [...s.questions]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...s, questions: next }
    })
  }

  const save = async () => {
    if (!survey.title.trim()) return
    setSaving(true)
    try { await onSave(survey) } finally { setSaving(false) }
  }

  const editing = !!initial?.id

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <button className="icon-btn" onClick={onCancel} title="Back">
          <ChevronLeft size={20} />
        </button>
        <h2 className="page-title" style={{ marginLeft: 4 }}>
          {editing ? 'Edit survey' : 'New survey'}
        </h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn" onClick={save} disabled={!survey.title.trim() || saving}
            style={{ opacity: !survey.title.trim() || saving ? 0.5 : 1 }}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Create survey')}
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 6, letterSpacing: '.4px', textTransform: 'uppercase' }}>
          Survey title
        </label>
        <input
          className="reg-input"
          placeholder="e.g. Summer Camp Feedback, Open House Survey…"
          value={survey.title}
          onChange={e => setSurvey(s => ({ ...s, title: e.target.value }))}
          autoFocus
        />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', margin: '16px 0 6px', letterSpacing: '.4px', textTransform: 'uppercase' }}>
          Intro text (optional)
        </label>
        <textarea
          className="reg-input"
          rows={4}
          placeholder="Shown before the first question. Separate paragraphs with a blank line."
          value={survey.intro}
          onChange={e => setSurvey(s => ({ ...s, intro: e.target.value }))}
          style={{ resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {survey.questions.map((q, idx) => (
          <QuestionRow
            key={q.id}
            question={q}
            onChange={patch => setQuestion(idx, patch)}
            onRemove={() => removeQuestion(idx)}
            onMoveUp={() => moveQuestion(idx, -1)}
            onMoveDown={() => moveQuestion(idx, 1)}
            isFirst={idx === 0}
            isLast={idx === survey.questions.length - 1}
          />
        ))}
      </div>

      <button
        onClick={addQuestion}
        style={{
          marginTop: 14, background: 'transparent', border: '2px dashed var(--line)',
          borderRadius: 12, padding: '14px 20px', width: '100%', fontSize: 14, fontWeight: 600,
          color: 'var(--ink-soft)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
        <Plus size={16} /> Add question
      </button>
    </div>
  )
}

function QuestionRow({ question, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const showOptions = HAS_OPTIONS.has(question.type)
  const updateOptions = (text) => onChange({ options: text.split('\n').map(s => s.trim()).filter(Boolean) })
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 16,
      display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 12, alignItems: 'start',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, alignItems: 'center', color: 'var(--muted)' }}>
        <button onClick={onMoveUp} disabled={isFirst} title="Move up" style={btnGhost(isFirst)}>▲</button>
        <GripVertical size={14} />
        <button onClick={onMoveDown} disabled={isLast} title="Move down" style={btnGhost(isLast)}>▼</button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 10 }}>
          <input
            className="reg-input"
            placeholder="Question text"
            value={question.text}
            onChange={e => onChange({ text: e.target.value })}
          />
          <select
            className="reg-input"
            value={question.type}
            onChange={e => onChange({ type: e.target.value })}
          >
            {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {showOptions && (
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4, letterSpacing: '.4px', textTransform: 'uppercase' }}>
              Options (one per line)
            </label>
            <textarea
              className="reg-input"
              rows={3}
              placeholder={"Option A\nOption B\nOption C"}
              value={(question.options || []).join('\n')}
              onChange={e => updateOptions(e.target.value)}
              style={{ resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
            />
          </div>
        )}

        {question.type === 'checkbox' && (
          <input
            className="reg-input"
            placeholder="Note shown under the question (optional), e.g. 'Select all that apply.'"
            value={question.note || ''}
            onChange={e => onChange({ note: e.target.value })}
          />
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!question.required}
            onChange={e => onChange({ required: e.target.checked })}
            style={{ accentColor: 'var(--logo-teal)' }}
          />
          Required
        </label>
      </div>

      <button onClick={onRemove} title="Remove question"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4 }}>
        <X size={16} />
      </button>
    </div>
  )
}

const btnGhost = (disabled) => ({
  background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
  color: disabled ? '#dfe3e6' : 'var(--ink-soft)', fontSize: 10, padding: 2,
})

// ------------------------------ TAKER ------------------------------
function SurveyTaker({ survey, onSubmit, onBack }) {
  const [step, setStep] = useState(0) // 0 = intro (only if intro text exists), 1..n = questions, n+1 = done
  const [agreed, setAgreed] = useState(!survey.intro)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const hasIntro = !!survey.intro
  const questions = survey.questions || []
  const qIndex = hasIntro ? step - 1 : step
  const q = questions[qIndex]
  const isIntro = hasIntro && step === 0
  const lastStep = hasIntro ? questions.length : questions.length - 1
  const isLast = step === lastStep
  const isDone = step > lastStep

  const setAnswer = (id, val) => setAnswers(a => ({ ...a, [id]: val }))

  const canNext = () => {
    if (isIntro) return agreed
    if (!q) return true
    if (q.required) {
      const v = answers[q.id]
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) return false
    }
    return true
  }

  const handleNext = async () => {
    if (isLast) {
      setSubmitting(true)
      try {
        await onSubmit(answers)
        setStep(s => s + 1)
      } finally {
        setSubmitting(false)
      }
      return
    }
    setStep(s => s + 1)
  }
  const handleBack = () => { if (step > 0) setStep(s => s - 1) }

  const starsFive = questions.some(qq => qq.type === 'stars' && answers[qq.id] === 5)

  if (isDone) {
    return (
      <div className="page">
        <div className="page-head" style={{ alignItems: 'center' }}>
          <button className="icon-btn" onClick={onBack} title="Back"><ChevronLeft size={20} /></button>
          <h2 className="page-title" style={{ marginLeft: 4 }}>{survey.title}</h2>
        </div>
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
            Your response has been recorded.
          </p>
          {starsFive && <GoogleReviewPrompt />}
          <button className="btn ghost" style={{ marginTop: 24 }} onClick={onBack}>Done</button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <button className="icon-btn" onClick={onBack} title="Back"><ChevronLeft size={20} /></button>
        <h2 className="page-title" style={{ marginLeft: 4 }}>{survey.title}</h2>
      </div>

      <div className="card" style={{ maxWidth: 780 }}>
        <div style={{ height: 5, background: 'var(--line)', borderRadius: '10px 10px 0 0', overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: 'var(--btn-teal)',
            width: `${((step + (hasIntro ? 0 : 1)) / (lastStep + 1)) * 100}%`,
            transition: 'width .3s',
          }} />
        </div>

        <div style={{ padding: '12px 24px 0', display: 'flex', justifyContent: 'flex-end' }}>
          <span className="small muted">{isIntro ? 'Introduction' : `Question ${qIndex + 1} of ${questions.length}`}</span>
        </div>

        <div className="survey-body">
          {isIntro && (
            <>
              {survey.intro.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, cursor: 'pointer', fontSize: 14 }}>
                <div className={'cbx' + (agreed ? ' checked' : '')} onClick={() => setAgreed(a => !a)}>
                  {agreed && <Check size={16} strokeWidth={3} />}
                </div>
                I understand the terms of the survey. <span style={{ color: 'var(--danger)' }}>*</span>
              </label>
            </>
          )}

          {!isIntro && q && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--ink)' }}>
                {qIndex + 1}. {q.text}
                {q.required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
              </div>
              {q.note && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 4 }}>{q.note}</div>}

              {q.type === 'radio' && (
                <Radio options={q.options || []} value={answers[q.id] || ''} onChange={v => setAnswer(q.id, v)} />
              )}
              {q.type === 'checkbox' && (
                <CheckboxGroup options={q.options || []} value={answers[q.id] || []} onChange={v => setAnswer(q.id, v)} />
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
              {q.type === 'stars' && <StarRating value={answers[q.id] || 0} onChange={v => setAnswer(q.id, v)} />}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28 }}>
            <button className="btn ghost" onClick={handleBack} disabled={step === 0}
              style={{ opacity: step === 0 ? 0.4 : 1 }}>
              Back
            </button>
            <button
              className="btn"
              onClick={handleNext}
              disabled={!canNext() || submitting}
              style={{ opacity: (canNext() && !submitting) ? 1 : 0.45 }}
            >
              {submitting ? 'Submitting…' : (isLast ? 'Submit' : 'Next')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ------------------------------ SUBMISSIONS ------------------------------
function SubmissionsView({ survey, onBack }) {
  const [subs, setSubs] = useState(null)

  const load = () => {
    setSubs(null)
    fetch(`${API_BASE}/api/surveys/${survey.id}/submissions`)
      .then(r => r.json()).then(setSubs).catch(() => setSubs([]))
  }
  useEffect(() => { load() }, [survey.id])

  const del = async (subId) => {
    if (!confirm('Delete this response?')) return
    try {
      await fetch(`${API_BASE}/api/surveys/${survey.id}/submissions/${subId}`, { method: 'DELETE' })
      setSubs(prev => prev.filter(s => s.id !== subId))
    } catch (err) { console.error(err) }
  }

  const exportCsv = () => {
    if (!subs || subs.length === 0) return
    const cols = survey.questions.map(q => q.id)
    const header = ['Submitted at', ...survey.questions.map(q => q.text || q.id)]
    const rows = subs.map(s => [
      s.submittedAt || '',
      ...cols.map(k => {
        const v = s.answers?.[k]
        return Array.isArray(v) ? v.join('; ') : (v ?? '')
      }),
    ])
    const csv = [header, ...rows].map(row =>
      row.map(cell => {
        const str = String(cell)
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
      }).join(',')
    ).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(survey.title || 'survey').replace(/[^\w-]+/g, '_')}_responses.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page">
      <div className="page-head" style={{ alignItems: 'center' }}>
        <button className="icon-btn" onClick={onBack} title="Back"><ChevronLeft size={20} /></button>
        <h2 className="page-title" style={{ marginLeft: 4 }}>{survey.title || 'Survey'} — Responses</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn ghost" onClick={exportCsv} disabled={!subs || subs.length === 0}
            style={{ opacity: !subs || subs.length === 0 ? 0.5 : 1 }}>
            <Download size={14} style={{ marginRight: 4 }} /> Export CSV
          </button>
        </div>
      </div>

      {subs === null ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      ) : subs.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '60px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
          No responses yet.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: '#f5f7f8' }}>
                <th style={thStyle}>Submitted</th>
                {survey.questions.map(q => <th key={q.id} style={thStyle}>{q.text || q.id}</th>)}
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s, i) => (
                <tr key={s.id} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--line)' }}>
                  <td style={tdStyle}>{fmtDate(s.submittedAt)}</td>
                  {survey.questions.map(q => (
                    <td key={q.id} style={tdStyle}>{formatAnswer(s.answers?.[q.id])}</td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button onClick={() => del(s.id)} title="Delete"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: 4 }}>
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle = { fontSize: 12, color: 'var(--ink-soft)', fontWeight: 700, textAlign: 'left', padding: '10px 14px', textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap' }
const tdStyle = { fontSize: 13, color: 'var(--ink)', padding: '10px 14px', verticalAlign: 'top' }

const formatAnswer = (v) => {
  if (v === undefined || v === null || v === '') return <span style={{ color: 'var(--muted)' }}>—</span>
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

const fmtDate = (iso) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  } catch { return iso }
}

// ------------------------------ MAIN ------------------------------
export default function Surveys() {
  const [surveys, setSurveys] = useState([])
  const [respCounts, setRespCounts] = useState({})
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState({ mode: 'list' }) // list | new | edit(id) | take(id) | subs(id)

  const refresh = () => {
    fetch(`${API_BASE}/api/surveys`)
      .then(r => r.json())
      .then(async (list) => {
        setSurveys(list)
        const counts = {}
        await Promise.all(list.map(async (s) => {
          try {
            const r = await fetch(`${API_BASE}/api/surveys/${s.id}/submissions`)
            const subs = await r.json()
            counts[s.id] = Array.isArray(subs) ? subs.length : 0
          } catch { counts[s.id] = 0 }
        }))
        setRespCounts(counts)
      })
      .catch(err => console.error('Failed to load surveys:', err))
      .finally(() => setLoading(false))
  }
  useEffect(() => { refresh() }, [])

  const createSurvey = async (draft) => {
    const res = await fetch(`${API_BASE}/api/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: draft.title.trim(), intro: draft.intro.trim(), questions: draft.questions.map(cleanQuestion) }),
    })
    if (!res.ok) throw new Error('Failed to create')
    const created = await res.json()
    setSurveys(prev => [...prev, created])
    setRespCounts(prev => ({ ...prev, [created.id]: 0 }))
    setView({ mode: 'list' })
  }

  const updateSurvey = async (id, draft) => {
    const res = await fetch(`${API_BASE}/api/surveys/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: draft.title.trim(), intro: draft.intro.trim(), questions: draft.questions.map(cleanQuestion) }),
    })
    if (!res.ok) throw new Error('Failed to update')
    const updated = await res.json()
    setSurveys(prev => prev.map(s => s.id === id ? updated : s))
    setView({ mode: 'list' })
  }

  const deleteSurvey = async (id) => {
    try {
      await fetch(`${API_BASE}/api/surveys/${id}`, { method: 'DELETE' })
      setSurveys(prev => prev.filter(s => s.id !== id))
    } catch (err) { console.error(err) }
  }

  const submitAnswers = async (surveyId, answers) => {
    await fetch(`${API_BASE}/api/surveys/${surveyId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    })
    setRespCounts(prev => ({ ...prev, [surveyId]: (prev[surveyId] || 0) + 1 }))
  }

  if (loading) {
    return (
      <div className="page">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading surveys…</div>
      </div>
    )
  }

  if (view.mode === 'new') {
    return <SurveyBuilder onSave={createSurvey} onCancel={() => setView({ mode: 'list' })} />
  }
  if (view.mode === 'edit') {
    const s = surveys.find(x => x.id === view.id)
    if (!s) { setView({ mode: 'list' }); return null }
    return <SurveyBuilder initial={s} onSave={(draft) => updateSurvey(view.id, draft)} onCancel={() => setView({ mode: 'list' })} />
  }
  if (view.mode === 'take') {
    const s = surveys.find(x => x.id === view.id)
    if (!s) { setView({ mode: 'list' }); return null }
    return <SurveyTaker survey={s} onSubmit={(answers) => submitAnswers(s.id, answers)} onBack={() => { refresh(); setView({ mode: 'list' }) }} />
  }
  if (view.mode === 'subs') {
    const s = surveys.find(x => x.id === view.id)
    if (!s) { setView({ mode: 'list' }); return null }
    return <SubmissionsView survey={s} onBack={() => setView({ mode: 'list' })} />
  }

  return (
    <SurveysList
      surveys={surveys}
      respCounts={respCounts}
      onNew={() => setView({ mode: 'new' })}
      onTake={(id) => setView({ mode: 'take', id })}
      onEdit={(id) => setView({ mode: 'edit', id })}
      onDelete={deleteSurvey}
      onOpenSubs={(id) => setView({ mode: 'subs', id })}
    />
  )
}

// Strip UI-only bits before sending to server.
const cleanQuestion = (q) => ({
  id: q.id,
  text: (q.text || '').trim(),
  type: q.type,
  note: (q.note || '').trim(),
  required: !!q.required,
  options: HAS_OPTIONS.has(q.type) ? (q.options || []).map(s => s.trim()).filter(Boolean) : [],
})
