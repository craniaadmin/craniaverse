import { useState } from 'react'
import { student, feeSchedule as fs } from '../data/mockData'

export default function FeeSchedule() {
  const [startLesson, setStartLesson] = useState(1)
  const [monthly, setMonthly] = useState(fs.monthly)

  const lessonsRemaining = Math.max(0, fs.totalWeeks - (startLesson - 1))
  const lessonFees = (monthly / 4.33) * lessonsRemaining // approx per-lesson
  const totalLessonFees = monthly * (fs.months.length) - (startLesson - 1) * (monthly / 4)
  const total = monthly * fs.months.length + fs.registrationFee + fs.materialFee
  const money = (n) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <div className="page">
      <h2 className="page-title">Fee Schedule</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 40, alignItems: 'start' }}>
        {/* Student card */}
        <div>
          <div className="panel-teal-head">Student</div>
          <div className="field-row"><label>First Name:</label><div className="field-val">{student.firstName}</div></div>
          <div className="field-row"><label>Last Name:</label><div className="field-val">{student.lastName}</div></div>
        </div>

        {/* Calculator */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          <div className="fee-calc">
            <div className="small muted" style={{ padding: '8px 14px' }}>Student: {student.firstName} {student.lastName[0]}.</div>
            <div className="fc-title">FEE SCHEDULE CALCULATOR</div>

            <div style={{ padding: '14px 16px 6px' }}>
              <div className="fee-row-dark">
                <span>ENTER FIRST LESSON NUMBER</span>
                <input className="fee-input" type="number" min="1" max={fs.totalWeeks}
                  value={startLesson} onChange={(e) => setStartLesson(Math.max(1, +e.target.value || 1))} />
              </div>
              <div className="fee-line muted" style={{ justifyContent: 'flex-start' }}>
                See <span className="red-text" style={{ margin: '0 4px' }}>Calendar</span> for Lesson Numbers
              </div>
              <div className="fee-row-dark">
                <span>ENTER MONTHLY INSTALLMENT</span>
                <input className="fee-input" type="number" value={monthly}
                  onChange={(e) => setMonthly(+e.target.value || 0)} />
              </div>
            </div>

            <div className="fee-total-head">TOTAL FEES</div>
            <div className="fee-line"><span>Total Lessons / Weeks</span><strong>{lessonsRemaining}</strong></div>
            <div className="fee-line"><span>Total Lesson Fees</span><strong>{money(monthly * fs.months.length)}</strong></div>
            <div className="fee-line muted">Total fees are divided into equal monthly payments. Late-start fees are pro-rated below.</div>
            <div className="fee-line" style={{ background: '#eef1f2', fontWeight: 700 }}>
              <span>TOTAL FEES (inc. registration &amp; material fee)</span><strong>{money(total)}</strong>
            </div>

            <div style={{ background: 'var(--card-teal)', height: 10 }} />

            <div style={{ padding: '8px 0 14px' }}>
              <div className="fee-pay"><div className="lab tone-gold">Registration Fee</div><div className="amt tone-gold">{money(fs.registrationFee)}</div></div>
              <div className="fee-pay"><div className="lab tone-gold">Material Fee</div><div className="amt tone-gold">{money(fs.materialFee)}</div></div>
              {fs.months.map((m) => (
                <div className="fee-pay" key={m}>
                  <div className="lab tone-blue">{m}</div>
                  <div className="amt tone-blue">{money(monthly)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', placeItems: 'center', paddingBottom: 16 }}>
              <button className="btn ghost" style={{ fontWeight: 800 }}>CALCULATE</button>
            </div>
          </div>

          <div className="red-text" style={{ fontSize: 22, fontFamily: 'var(--serif)', paddingTop: 90 }}>
            current sample
          </div>
        </div>
      </div>
    </div>
  )
}
