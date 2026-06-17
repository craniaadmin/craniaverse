import { useState, useMemo } from 'react'
import { useStore } from '../data/store'

// ── 2025 Canadian Payroll Tax Constants (Ontario) ──────────────────────────
const TAX_YEAR = 2025

const CPP_RATE        = 0.0595
const CPP_EXEMPTION   = 3500       // annual basic exemption
const CPP_MAX_EARN    = 68500      // annual max pensionable earnings

const EI_RATE_EE      = 0.0166
const EI_RATE_ER      = EI_RATE_EE * 1.4   // employer pays 1.4×
const EI_MAX_EARN     = 63200      // annual max insurable earnings

const FED_BASIC       = 16129
const FED_BRACKETS = [
  { size: 57375,    rate: 0.15   },
  { size: 57375,    rate: 0.205  },
  { size: 43769,    rate: 0.26   },
  { size: 61481,    rate: 0.29   },
  { size: Infinity, rate: 0.33   },
]

const ON_BASIC        = 12399
const ON_BRACKETS = [
  { size: 51446,    rate: 0.0505 },
  { size: 51448,    rate: 0.0915 },
  { size: 47106,    rate: 0.1116 },
  { size: 70000,    rate: 0.1216 },
  { size: Infinity, rate: 0.1316 },
]

const PAY_PERIODS = { 'Weekly': 52, 'Bi-weekly': 26, 'Semi-monthly': 24, 'Monthly': 12 }
const PERIOD_DAYS = { 'Weekly': 6, 'Bi-weekly': 13, 'Semi-monthly': 14, 'Monthly': 30 }

function bracketTax(taxable, brackets) {
  let tax = 0, rem = Math.max(0, taxable)
  for (const { size, rate } of brackets) {
    if (rem <= 0) break
    tax += Math.min(rem, size) * rate
    rem -= size
  }
  return tax
}

function calcTaxes(grossPay, periodsPerYear) {
  const annual = grossPay * periodsPerYear
  const r2 = (n) => Math.round(n * 100) / 100

  // CPP
  const annualCppBase = Math.min(Math.max(0, annual - CPP_EXEMPTION), CPP_MAX_EARN - CPP_EXEMPTION)
  const cppEE = r2((annualCppBase / periodsPerYear) * CPP_RATE)
  const cppER = cppEE

  // EI
  const annualEiBase = Math.min(annual, EI_MAX_EARN)
  const eiEE = r2((annualEiBase / periodsPerYear) * EI_RATE_EE)
  const eiER = r2(eiEE * 1.4)

  // Income tax (annualise → brackets → divide back)
  const fedTax   = bracketTax(annual - FED_BASIC, FED_BRACKETS)
  const onTax    = bracketTax(annual - ON_BASIC,  ON_BRACKETS)
  const taxPP    = r2((fedTax + onTax) / periodsPerYear)

  const totalDed = r2(cppEE + eiEE + taxPP)
  const netPay   = r2(grossPay - totalDed)
  const craRem   = r2(taxPP + cppEE + cppER + eiEE + eiER)

  return { gross: grossPay, cppEE, cppER, eiEE, eiER, taxPP, totalDed, netPay, craRem }
}

const fmt = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const todayStr = () => new Date().toISOString().slice(0, 10)

function lsLoad(key, fb) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fb } catch { return fb } }
function lsSave(key, v)  { try { localStorage.setItem(key, JSON.stringify(v)) } catch {} }

// ── Print helper ───────────────────────────────────────────────────────────
function printHtml(title, body) {
  const w = window.open('', '_blank', 'width=820,height=700')
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; margin: 40px; color: #222; font-size: 13px; }
    h1  { font-size: 20px; margin: 0 0 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th  { background: #2c7a7b; color: #fff; padding: 6px 9px; text-align: left; font-size: 11px; }
    th.r, td.r { text-align: right; }
    td  { padding: 6px 9px; border-bottom: 1px solid #eee; }
    .bold { font-weight: 700; }
    .teal { color: #2c7a7b; }
    .grey { color: #777; }
    .net-row td { background: #eef6f6; font-weight: 700; font-size: 15px; }
    .hdr  { display: flex; justify-content: space-between; padding-bottom: 12px; border-bottom: 2px solid #2c7a7b; margin-bottom: 16px; }
    .hdr-co { font-size: 20px; font-weight: 800; color: #2c7a7b; }
    .pill { display: inline-block; background: #fff8e1; border: 1px solid #f9a825; border-radius: 4px; padding: 8px 14px; margin-top: 12px; }
    .grid3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin: 12px 0; }
    .box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; }
    .box-num { font-size: 10px; color: #888; font-weight: 700; }
    .box-val { font-size: 16px; font-weight: 700; color: #2c7a7b; margin-top: 2px; }
    @media print { body { margin: 20px; } }
  </style></head><body>${body}</body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 300)
}

// ── Paystub modal ──────────────────────────────────────────────────────────
function PaystubModal({ entry, run, onClose }) {
  const ytd = entry.ytd || {}

  const handlePrint = () => {
    const body = `
      <div class="hdr">
        <div>
          <div class="hdr-co">CRANIA SCHOOLS</div>
          <div style="font-size:12px;color:#666;">Employee Pay Statement · ${TAX_YEAR}</div>
        </div>
        <div style="text-align:right;font-size:12px;">
          <div><b>Pay Period:</b> ${run.periodStart} — ${run.periodEnd}</div>
          <div><b>Pay Date:</b> ${run.processedAt}</div>
          <div><b>Type:</b> ${run.periodType}</div>
        </div>
      </div>

      <div style="margin-bottom:12px;">
        <div class="bold" style="font-size:15px;">${entry.name}</div>
        <div class="grey">${entry.role || 'Staff'}${entry.sin ? ' · SIN ***-***-' + String(entry.sin).slice(-3) : ''}</div>
      </div>

      <table>
        <thead><tr>
          <th>Description</th><th class="r">Hours</th><th class="r">Rate</th><th class="r">Amount</th>
        </tr></thead>
        <tbody>
          <tr><td>Regular Pay</td><td class="r">${entry.hours}</td><td class="r">${fmt(entry.rate)}</td><td class="r bold">${fmt(entry.gross)}</td></tr>
        </tbody>
      </table>

      <table>
        <thead><tr><th>Deduction</th><th class="r">This Period</th><th class="r">YTD</th></tr></thead>
        <tbody>
          <tr><td>CPP Contributions (Box 16)</td><td class="r">${fmt(entry.cppEE)}</td><td class="r grey">${ytd.cppEE ? fmt(ytd.cppEE) : '—'}</td></tr>
          <tr><td>EI Premiums (Box 18)</td><td class="r">${fmt(entry.eiEE)}</td><td class="r grey">${ytd.eiEE ? fmt(ytd.eiEE) : '—'}</td></tr>
          <tr><td>Income Tax — Fed + ON (Box 22)</td><td class="r">${fmt(entry.taxPP)}</td><td class="r grey">${ytd.taxPP ? fmt(ytd.taxPP) : '—'}</td></tr>
          <tr class="net-row"><td>Total Deductions</td><td class="r">${fmt(entry.totalDed)}</td><td class="r grey">${ytd.totalDed ? fmt(ytd.totalDed) : '—'}</td></tr>
        </tbody>
      </table>

      <div style="background:linear-gradient(135deg,#2c7a7b,#3d8e90);border-radius:8px;padding:14px 18px;color:#fff;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:600;">NET PAY</div>
        <div style="font-size:26px;font-weight:800;">${fmt(entry.netPay)}</div>
      </div>

      <div class="pill">
        <b>CRA Remittance (employer owes):</b> ${fmt(entry.craRem)}
        <span class="grey" style="font-size:11px;"> = tax + CPP×2 + EI×2.4</span>
      </div>

      <p style="font-size:10px;color:#aaa;margin-top:16px;">
        Computer-generated estimate · ${TAX_YEAR} Ontario rates · Consult a payroll professional before filing.
      </p>
    `
    printHtml(`Paystub — ${entry.name}`, body)
  }

  const row = (label, pp, ytdVal) => (
    <tr key={label} style={{ borderBottom: '1px solid #f0f0f0' }}>
      <td style={{ padding: '7px 10px', fontSize: 13 }}>{label}</td>
      <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13 }}>{fmt(pp)}</td>
      <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13, color: '#888' }}>{ytdVal ? fmt(ytdVal) : '—'}</td>
    </tr>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: 620, maxHeight: '90vh', overflow: 'auto', padding: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>Paystub — {entry.name}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={{ background: '#2c7a7b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 600 }}>Print / PDF</button>
            <button onClick={onClose} style={{ background: '#eee', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}>Close</button>
          </div>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '2px solid #2c7a7b', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#2c7a7b' }}>CRANIA SCHOOLS</div>
            <div style={{ fontSize: 11, color: '#888' }}>Employee Pay Statement · {TAX_YEAR}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div><strong>Period:</strong> {run.periodStart} — {run.periodEnd}</div>
            <div><strong>Pay Date:</strong> {run.processedAt}</div>
            <div><strong>Type:</strong> {run.periodType}</div>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{entry.name}</div>
          <div style={{ fontSize: 12, color: '#666' }}>{entry.role || 'Staff'}{entry.sin ? ` · SIN ***-***-${String(entry.sin).slice(-3)}` : ''}</div>
        </div>

        {/* Earnings */}
        <div style={{ marginBottom: 12 }}>
          <div className="panel-teal-head" style={{ marginBottom: 0 }}>Earnings</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#3d8e90' }}>
                {['Description', 'Hours', 'Rate', 'Amount'].map((h, i) => (
                  <th key={h} style={{ padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '7px 10px', fontSize: 13 }}>Regular Pay</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13 }}>{entry.hours}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13 }}>{fmt(entry.rate)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(entry.gross)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Deductions */}
        <div style={{ marginBottom: 14 }}>
          <div className="panel-teal-head" style={{ marginBottom: 0 }}>Deductions</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#3d8e90' }}>
                {['Deduction', 'This Period', 'YTD'].map((h, i) => (
                  <th key={h} style={{ padding: '6px 10px', color: '#fff', fontSize: 11, fontWeight: 700, textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row('CPP Contributions (Box 16)', entry.cppEE, ytd.cppEE)}
              {row('EI Premiums (Box 18)', entry.eiEE, ytd.eiEE)}
              {row('Income Tax — Fed + ON (Box 22)', entry.taxPP, ytd.taxPP)}
              <tr style={{ background: '#f5f5f5' }}>
                <td style={{ padding: '7px 10px', fontSize: 13, fontWeight: 700 }}>Total Deductions</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(entry.totalDed)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 13, color: '#888' }}>{ytd.totalDed ? fmt(ytd.totalDed) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Net pay */}
        <div style={{ background: 'linear-gradient(135deg,#2c7a7b,#3d8e90)', borderRadius: 8, padding: '14px 18px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>NET PAY</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{fmt(entry.netPay)}</div>
        </div>

        {/* CRA note */}
        <div style={{ background: '#fff8e1', border: '1px solid #f9a825', borderRadius: 6, padding: '10px 14px', fontSize: 12 }}>
          <strong>CRA remittance (employer owes this period):</strong> {fmt(entry.craRem)}
          <span style={{ color: '#888', marginLeft: 6 }}>= income tax + CPP×2 + EI×2.4</span>
        </div>

        <div style={{ marginTop: 12, fontSize: 10, color: '#bbb' }}>
          Computer-generated estimate · {TAX_YEAR} Ontario rates · Verify with a payroll professional before filing.
        </div>
      </div>
    </div>
  )
}

// ── T4 modal ───────────────────────────────────────────────────────────────
function T4Modal({ member, ytd, onClose }) {
  const boxes = [
    { num: '14', label: 'Employment Income',            val: ytd.gross    },
    { num: '16', label: 'Employee CPP Contributions',   val: ytd.cppEE   },
    { num: '18', label: 'Employee EI Premiums',         val: ytd.eiEE    },
    { num: '22', label: 'Income Tax Deducted',          val: ytd.taxPP   },
    { num: '24', label: 'EI Insurable Earnings',        val: ytd.gross    },
    { num: '26', label: 'CPP Pensionable Earnings',     val: ytd.gross    },
  ]

  const handlePrint = () => {
    const boxHtml = boxes.map(b => `
      <div class="box">
        <div class="box-num">Box ${b.num}</div>
        <div style="font-size:11px;color:#555;margin:2px 0 4px;">${b.label}</div>
        <div class="box-val">${fmt(b.val)}</div>
      </div>`).join('')

    const body = `
      <div style="background:#2c7a7b;color:#fff;padding:12px 16px;border-radius:6px;margin-bottom:16px;">
        <div style="font-size:18px;font-weight:800;">T4 — Statement of Remuneration Paid</div>
        <div style="font-size:13px;opacity:.85;">Tax Year: ${TAX_YEAR} · Crania Schools</div>
      </div>

      <div style="background:#f5f5f5;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px;">
        <div><b>Employee:</b> ${member.name}</div>
        ${member.sin ? `<div><b>SIN:</b> ***-***-${String(member.sin).slice(-3)}</div>` : ''}
        <div><b>Employer:</b> Crania Schools &nbsp;·&nbsp; Province of Employment: ON</div>
      </div>

      <div class="grid3">${boxHtml}</div>

      <p style="font-size:10px;color:#aaa;margin-top:16px;">
        System-generated T4 estimate based on recorded payroll runs for ${TAX_YEAR}.
        Verify all totals with your accountant before CRA filing.
      </p>
    `
    printHtml(`T4 ${TAX_YEAR} — ${member.name}`, body)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 12, width: 580, maxHeight: '90vh', overflow: 'auto', padding: 30 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>T4 — {member.name} ({TAX_YEAR})</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handlePrint} style={{ background: '#2c7a7b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 600 }}>Print / PDF</button>
            <button onClick={onClose} style={{ background: '#eee', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer' }}>Close</button>
          </div>
        </div>

        <div style={{ background: '#2c7a7b', color: '#fff', padding: '12px 16px', borderRadius: 7, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>T4 — Statement of Remuneration Paid</div>
          <div style={{ fontSize: 12, opacity: .8 }}>Tax Year: {TAX_YEAR} · Crania Schools</div>
        </div>

        <div style={{ background: '#f5f5f5', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          <div><strong>Employee:</strong> {member.name}</div>
          {member.sin && <div><strong>SIN:</strong> ***-***-{String(member.sin).slice(-3)}</div>}
          <div><strong>Employer:</strong> Crania Schools · Province of Employment: ON</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
          {boxes.map(({ num, label, val }) => (
            <div key={num} style={{ border: '1px solid #ddd', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888' }}>Box {num}</div>
              <div style={{ fontSize: 11, color: '#555', margin: '2px 0 6px' }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#2c7a7b' }}>{fmt(val)}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10, color: '#bbb' }}>
          System-generated T4 estimate based on recorded payroll runs for {TAX_YEAR}. Verify all totals with your accountant before CRA filing.
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function Payroll() {
  const { staff } = useStore()

  const [periodType,  setPeriodType]  = useState('Bi-weekly')
  const [periodStart, setPeriodStart] = useState(todayStr())
  const [periodEnd,   setPeriodEnd]   = useState('')
  const [hoursMap,    setHoursMap]    = useState({})
  const [runs,        setRuns]        = useState(() => lsLoad('payroll-runs', []))
  const [expandedRun, setExpandedRun] = useState(null)
  const [paystub,     setPaystub]     = useState(null)  // { entry, run }
  const [t4Target,    setT4Target]    = useState(null)  // { member, ytd }

  // Auto-compute period end
  const autoEnd = useMemo(() => {
    if (!periodStart) return ''
    const d = new Date(periodStart)
    d.setDate(d.getDate() + (PERIOD_DAYS[periodType] || 13))
    return d.toISOString().slice(0, 10)
  }, [periodStart, periodType])

  const effectiveEnd = periodEnd || autoEnd
  const periodsPerYear = PAY_PERIODS[periodType] || 26

  // Compute rows for current period
  const rows = useMemo(() => staff.map(s => {
    const rate  = parseFloat(s.ratePerHour) || 0
    const hours = parseFloat(hoursMap[s.id]) || 0
    const gross = Math.round(rate * hours * 100) / 100
    const taxes = gross > 0 ? calcTaxes(gross, periodsPerYear) : null
    return { ...s, name: `${s.firstName} ${s.lastName}`, rate, hours, ...(taxes || {}) }
  }), [staff, hoursMap, periodsPerYear])

  const totals = useMemo(() => rows.reduce((a, r) => ({
    gross:    a.gross    + (r.gross    || 0),
    cppEE:    a.cppEE   + (r.cppEE   || 0),
    cppER:    a.cppER   + (r.cppER   || 0),
    eiEE:     a.eiEE    + (r.eiEE    || 0),
    eiER:     a.eiER    + (r.eiER    || 0),
    taxPP:    a.taxPP   + (r.taxPP   || 0),
    totalDed: a.totalDed + (r.totalDed || 0),
    netPay:   a.netPay  + (r.netPay  || 0),
    craRem:   a.craRem  + (r.craRem  || 0),
  }), { gross:0, cppEE:0, cppER:0, eiEE:0, eiER:0, taxPP:0, totalDed:0, netPay:0, craRem:0 }), [rows])

  // YTD from localStorage
  const ytdYear = new Date().getFullYear()
  const ytdKey  = `payroll-ytd-${ytdYear}`
  const ytdAll  = lsLoad(ytdKey, {})

  const processPayRun = () => {
    const entries = rows.filter(r => r.hours > 0 && r.gross > 0).map(r => ({
      staffId: r.id, name: r.name, role: r.role, sin: r.sin,
      hours: r.hours, rate: r.rate, gross: r.gross,
      cppEE: r.cppEE, cppER: r.cppER, eiEE: r.eiEE, eiER: r.eiER,
      taxPP: r.taxPP, totalDed: r.totalDed, netPay: r.netPay, craRem: r.craRem,
    }))
    if (!entries.length) { alert('Enter hours for at least one employee.'); return }

    const run = {
      id: Date.now(), periodType,
      periodStart, periodEnd: effectiveEnd,
      processedAt: todayStr(),
      entries,
      totals: { gross: totals.gross, netPay: totals.netPay, craRem: totals.craRem },
    }
    const nextRuns = [run, ...runs]
    setRuns(nextRuns)
    lsSave('payroll-runs', nextRuns)

    // Update YTD
    const ytd = lsLoad(ytdKey, {})
    entries.forEach(e => {
      const p = ytd[e.staffId] || {}
      ytd[e.staffId] = {
        gross:    (p.gross    || 0) + e.gross,
        cppEE:    (p.cppEE   || 0) + e.cppEE,
        eiEE:     (p.eiEE    || 0) + e.eiEE,
        taxPP:    (p.taxPP   || 0) + e.taxPP,
        totalDed: (p.totalDed || 0) + e.totalDed,
        netPay:   (p.netPay  || 0) + e.netPay,
      }
    })
    lsSave(ytdKey, ytd)

    setHoursMap({})
    alert(`Pay run processed · ${entries.length} employee${entries.length !== 1 ? 's' : ''} · CRA remittance: ${fmt(totals.craRem)}`)
  }

  const currentRun = {
    periodStart, periodEnd: effectiveEnd,
    periodType, processedAt: todayStr(),
  }

  const labelStyle = { fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.3px' }
  const inputStyle = { border: '1px solid var(--line)', borderRadius: 6, padding: '7px 10px', fontSize: 13, fontFamily: 'inherit' }
  const TH = ({ children, right }) => (
    <th style={{ padding: '8px 10px', textAlign: right ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{children}</th>
  )

  return (
    <div className="page" style={{ paddingBottom: 48 }}>
      <h2 className="page-title">Payroll</h2>

      {/* ── Pay period config ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end', background: '#f8fafb', border: '1px solid var(--line)', borderRadius: 10, padding: '16px 20px', marginBottom: 24 }}>
        <div>
          <div style={labelStyle}>Period Type</div>
          <select value={periodType} onChange={e => { setPeriodType(e.target.value); setPeriodEnd('') }}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            {Object.keys(PAY_PERIODS).map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <div style={labelStyle}>Period Start</div>
          <input type="date" value={periodStart} onChange={e => { setPeriodStart(e.target.value); setPeriodEnd('') }}
            style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Period End</div>
          <input type="date" value={effectiveEnd} onChange={e => setPeriodEnd(e.target.value)}
            style={inputStyle} />
        </div>
        <div>
          <div style={labelStyle}>Tax Year</div>
          <div style={{ ...inputStyle, background: '#eee', color: '#666', display: 'inline-block' }}>{TAX_YEAR} · Ontario</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={processPayRun} style={{
            background: '#2c7a7b', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 26px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>Process Pay Run</button>
        </div>
      </div>

      {/* ── Employee hours table ───────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ background: '#1a1a1a', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Employee Hours &amp; Pay ({periodType})</span>
          <span style={{ fontSize: 11, opacity: .6 }}>{TAX_YEAR} · CPP 5.95% · EI 1.66% · Fed+ON brackets</span>
        </div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#3d8e90' }}>
                <TH>Employee</TH>
                <TH>Role</TH>
                <TH right>Rate/hr</TH>
                <TH right>Hours</TH>
                <TH right>Gross Pay</TH>
                <TH right>CPP (EE)</TH>
                <TH right>EI (EE)</TH>
                <TH right>Income Tax</TH>
                <TH right>Net Pay</TH>
                <TH>Paystub</TH>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic' }}>
                  No staff found. Add staff in Staff Information.
                </td></tr>
              ) : staff.map((s, i) => {
                const r = rows.find(x => x.id === s.id)
                const hasGross = r && r.gross > 0
                return (
                  <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfb', borderBottom: '1px solid #f0f0f0' }}>
                    <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: 13 }}>{s.firstName} {s.lastName}</td>
                    <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--ink-soft)' }}>{s.role || '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13 }}>
                      {s.ratePerHour ? fmt(parseFloat(s.ratePerHour)) : <span style={{ color: '#e53935', fontSize: 11 }}>no rate set</span>}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      <input
                        type="number" min="0" step="0.5"
                        value={hoursMap[s.id] ?? ''}
                        onChange={e => setHoursMap(p => ({ ...p, [s.id]: e.target.value }))}
                        placeholder="0"
                        style={{ width: 68, border: '1px solid var(--line)', borderRadius: 5, padding: '5px 7px', fontSize: 13, textAlign: 'right', fontFamily: 'inherit' }}
                      />
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontWeight: hasGross ? 700 : 400, color: hasGross ? '#1a1a1a' : '#ccc' }}>{hasGross ? fmt(r.gross) : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, color: hasGross ? '#1a1a1a' : '#ccc' }}>{hasGross ? fmt(r.cppEE) : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, color: hasGross ? '#1a1a1a' : '#ccc' }}>{hasGross ? fmt(r.eiEE) : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, color: hasGross ? '#1a1a1a' : '#ccc' }}>{hasGross ? fmt(r.taxPP) : '—'}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: hasGross ? '#2c7a7b' : '#ccc' }}>{hasGross ? fmt(r.netPay) : '—'}</td>
                    <td style={{ padding: '6px 10px' }}>
                      {hasGross && (
                        <button onClick={() => setPaystub({ entry: { ...r, ytd: ytdAll[s.id] }, run: currentRun })}
                          style={{ background: 'none', border: '1px solid var(--logo-teal)', borderRadius: 4, padding: '3px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--logo-teal)', fontWeight: 600 }}>
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {/* Totals */}
              {staff.length > 0 && (
                <tr style={{ background: '#1a1a1a', color: '#fff' }}>
                  <td colSpan={4} style={{ padding: '10px 10px', fontWeight: 700, fontSize: 13 }}>TOTALS</td>
                  {[totals.gross, totals.cppEE, totals.eiEE, totals.taxPP].map((v, i) => (
                    <td key={i} style={{ padding: '10px 10px', textAlign: 'right', fontWeight: i === 0 ? 700 : 400, fontSize: 13 }}>{fmt(v)}</td>
                  ))}
                  <td style={{ padding: '10px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#a6e2f9' }}>{fmt(totals.netPay)}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CRA Remittance ─────────────────────────────────────────────── */}
      {totals.gross > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ background: '#6a1f10', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0', fontWeight: 700, fontSize: 15 }}>
            CRA Remittance — What You Owe the Government
          </div>
          <div style={{ border: '1px solid #f0c0b0', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff9f7', padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Income Tax Withheld', sub: 'Source deductions',  val: totals.taxPP  },
                { label: 'Employee CPP',        sub: 'Collected from EE',  val: totals.cppEE  },
                { label: 'Employer CPP',        sub: 'Your matched share', val: totals.cppER  },
                { label: 'Employee EI',         sub: 'Collected from EE',  val: totals.eiEE   },
                { label: 'Employer EI',         sub: '1.4× employee EI',   val: totals.eiER   },
              ].map(({ label, sub, val }) => (
                <div key={label} style={{ background: '#fff', border: '1px solid #f0c0b0', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: '#8b2020', fontWeight: 700 }}>{label}</div>
                  <div style={{ fontSize: 10, color: '#aaa', margin: '2px 0 6px' }}>{sub}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#6a1f10' }}>{fmt(val)}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: '#fff', border: '1px solid #f0c0b0', borderRadius: 8, padding: '14px 16px', fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Total Employer Labour Cost</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Gross payroll</span><span style={{ fontWeight: 600 }}>{fmt(totals.gross)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span>Employer CPP</span><span>{fmt(totals.cppER)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #eee', fontWeight: 700 }}>
                  <span>Total cost</span><span>{fmt(totals.gross + totals.cppER + totals.eiER)}</span>
                </div>
              </div>

              <div style={{ background: 'linear-gradient(135deg,#6a1f10,#9a3020)', borderRadius: 8, padding: '14px 16px', color: '#fff' }}>
                <div style={{ fontSize: 11, opacity: .8, fontWeight: 700, marginBottom: 4 }}>TOTAL DUE TO CRA THIS PERIOD</div>
                <div style={{ fontSize: 11, opacity: .65, marginBottom: 10 }}>
                  Income tax + Employee CPP + Employer CPP + Employee EI + Employer EI
                </div>
                <div style={{ fontSize: 30, fontWeight: 800 }}>{fmt(totals.craRem)}</div>
                <div style={{ fontSize: 11, opacity: .7, marginTop: 6 }}>
                  Due: 15th of the following month (regular remitter)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Pay run history ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ background: '#1a1a1a', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Pay Run History</span>
          {runs.length > 0 && (
            <button onClick={() => { if (confirm('Clear all payroll history and YTD data?')) { setRuns([]); lsSave('payroll-runs', []); lsSave(ytdKey, {}) } }}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,.3)', color: '#fff', fontSize: 11, borderRadius: 5, padding: '3px 10px', cursor: 'pointer', opacity: .7 }}>
              Clear All
            </button>
          )}
        </div>
        <div style={{ border: '1px solid var(--line)', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', overflowX: 'auto' }}>
          {runs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 }}>No pay runs processed yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#3d8e90' }}>
                  <TH>Period</TH><TH>Type</TH>
                  <TH right>Employees</TH>
                  <TH right>Gross</TH>
                  <TH right>Net</TH>
                  <TH right>CRA Remittance</TH>
                  <TH>Processed</TH>
                  <TH>Detail</TH>
                </tr>
              </thead>
              <tbody>
                {runs.map((run, i) => (
                  <>
                    <tr key={run.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfb', borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 10px', fontSize: 13 }}>{run.periodStart} → {run.periodEnd}</td>
                      <td style={{ padding: '8px 10px', fontSize: 13 }}>{run.periodType}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13 }}>{run.entries.length}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{fmt(run.totals.gross)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13 }}>{fmt(run.totals.netPay)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#6a1f10' }}>{fmt(run.totals.craRem)}</td>
                      <td style={{ padding: '8px 10px', fontSize: 13 }}>{run.processedAt}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <button onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                          style={{ background: 'none', border: '1px solid var(--logo-teal)', borderRadius: 4, padding: '3px 9px', fontSize: 11, cursor: 'pointer', color: 'var(--logo-teal)', fontWeight: 600 }}>
                          {expandedRun === run.id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                    {expandedRun === run.id && (
                      <tr key={`${run.id}-detail`}>
                        <td colSpan={8} style={{ padding: 0, background: '#f8fafb', borderBottom: '2px solid var(--logo-teal)' }}>
                          <div style={{ padding: '14px 16px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: '#eee' }}>
                                  {['Employee', 'Hours', 'Rate', 'Gross', 'CPP (EE)', 'EI (EE)', 'Tax', 'Net Pay', 'Paystub'].map((h, idx) => (
                                    <th key={h} style={{ padding: '5px 8px', textAlign: idx > 0 && idx < 8 ? 'right' : 'left', fontWeight: 700, fontSize: 11 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {run.entries.map((e, ei) => (
                                  <tr key={ei} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>{e.name}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{e.hours}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(e.rate)}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(e.gross)}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(e.cppEE)}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(e.eiEE)}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(e.taxPP)}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#2c7a7b' }}>{fmt(e.netPay)}</td>
                                    <td style={{ padding: '5px 8px' }}>
                                      <button onClick={() => setPaystub({ entry: { ...e, ytd: ytdAll[e.staffId] }, run })}
                                        style={{ background: 'none', border: '1px solid var(--logo-teal)', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--logo-teal)', fontWeight: 600 }}>
                                        View
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── T4 year-to-date ────────────────────────────────────────────── */}
      <div>
        <div style={{ background: '#1a1a1a', color: '#fff', padding: '12px 18px', borderRadius: '8px 8px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>T4 — Year to Date ({ytdYear})</span>
          <span style={{ fontSize: 11, opacity: .6 }}>Generate from pay run history</span>
        </div>
        <div style={{ border: '1px solid var(--line)', borderTop: 'none', borderRadius: '0 0 8px 8px', background: '#fff', overflowX: 'auto' }}>
          {staff.filter(s => ytdAll[s.id]).length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 }}>
              Process pay runs to generate YTD data for T4 statements.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#3d8e90' }}>
                  <TH>Employee</TH>
                  <TH>Role</TH>
                  <TH right>Box 14 — Income</TH>
                  <TH right>Box 16 — CPP</TH>
                  <TH right>Box 18 — EI</TH>
                  <TH right>Box 22 — Tax</TH>
                  <TH right>Net Pay YTD</TH>
                  <TH>Generate</TH>
                </tr>
              </thead>
              <tbody>
                {staff.filter(s => ytdAll[s.id]).map((s, i) => {
                  const y = ytdAll[s.id]
                  return (
                    <tr key={s.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfb', borderBottom: '1px solid #f0f0f0' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: 13 }}>{s.firstName} {s.lastName}</td>
                      <td style={{ padding: '8px 10px', fontSize: 13, color: 'var(--ink-soft)' }}>{s.role || '—'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>{fmt(y.gross)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13 }}>{fmt(y.cppEE)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13 }}>{fmt(y.eiEE)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13 }}>{fmt(y.taxPP)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#2c7a7b' }}>{fmt(y.netPay)}</td>
                      <td style={{ padding: '6px 10px' }}>
                        <button onClick={() => setT4Target({ member: { id: s.id, name: `${s.firstName} ${s.lastName}`, sin: s.sin, role: s.role }, ytd: y })}
                          style={{ background: '#2c7a7b', border: 'none', borderRadius: 5, padding: '4px 12px', fontSize: 11, cursor: 'pointer', color: '#fff', fontWeight: 700 }}>
                          T4
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {paystub && (
        <PaystubModal entry={paystub.entry} run={paystub.run} onClose={() => setPaystub(null)} />
      )}
      {t4Target && (
        <T4Modal member={t4Target.member} ytd={t4Target.ytd} onClose={() => setT4Target(null)} />
      )}
    </div>
  )
}
