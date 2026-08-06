import { useMemo, useState } from 'react'
import { Plus, Edit2, Trash2, Search } from 'lucide-react'
import {
  useFinance, money, todayISO, formatDate,
  invoiceBalance,
} from '../data/finance'
import {
  PageShell, Loading, OfflineBanner, SummaryStrip,
  Th, Td, IconButton, Modal, ModalFooter, Field,
} from '../components/FinanceUI'
import PageActions, { PAGEACTIONS_CSS } from '../components/PageActions'

const METHODS = ['Cash', 'E-Transfer', 'Cheque', 'Credit Card', 'Debit', 'Other']

const BLANK = () => ({
  id: null,
  date: todayISO(),
  invoiceId: '',
  customerName: '',
  amount: 0,
  method: 'E-Transfer',
  reference: '',
  note: '',
})

export default function Payments() {
  const { invoices, payments, loading, status, addPayment, updatePayment, deletePayment } = useFinance()
  const [query, setQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState('all')
  const [modal, setModal] = useState(null) // null | 'new' | { edit: id }
  const [form, setForm] = useState(BLANK())

  const invoiceById = useMemo(() => Object.fromEntries(invoices.map(i => [i.id, i])), [invoices])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return payments
      .filter(p => methodFilter === 'all' ? true : p.method === methodFilter)
      .filter(p => !q ||
        p.customerName?.toLowerCase().includes(q) ||
        invoiceById[p.invoiceId]?.number?.toLowerCase().includes(q) ||
        p.reference?.toLowerCase().includes(q) ||
        p.receiptNumber?.toLowerCase().includes(q))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [payments, methodFilter, query, invoiceById])

  const totals = useMemo(() => {
    const nowY = new Date().getFullYear()
    const nowM = new Date().getMonth()
    let ytd = 0, mtd = 0, all = 0
    const byMethod = {}
    for (const p of payments) {
      const amt = Number(p.amount || 0)
      all += amt
      const d = new Date(p.date + 'T00:00:00')
      if (!Number.isNaN(d.getTime())) {
        if (d.getFullYear() === nowY) ytd += amt
        if (d.getFullYear() === nowY && d.getMonth() === nowM) mtd += amt
      }
      byMethod[p.method] = (byMethod[p.method] || 0) + amt
    }
    return { ytd, mtd, all, byMethod, count: payments.length }
  }, [payments])

  const openNew = (prefillInvoice = null) => {
    if (prefillInvoice) {
      const bal = invoiceBalance(prefillInvoice, payments).balance
      setForm({
        ...BLANK(),
        invoiceId: prefillInvoice.id,
        customerName: prefillInvoice.customerName,
        amount: bal,
      })
    } else {
      setForm(BLANK())
    }
    setModal('new')
  }

  const openEdit = (p) => {
    setForm({ ...BLANK(), ...p })
    setModal({ edit: p.id })
  }

  const onPickInvoice = (id) => {
    const inv = invoiceById[id]
    if (!inv) { setForm(f => ({ ...f, invoiceId: '' })); return }
    const bal = invoiceBalance(inv, payments.filter(p => p.id !== (modal?.edit || null))).balance
    setForm(f => ({
      ...f,
      invoiceId: id,
      customerName: inv.customerName || f.customerName,
      amount: f.amount || bal,
    }))
  }

  const saveForm = () => {
    const cleaned = {
      ...form,
      customerName: form.customerName.trim(),
      reference: form.reference.trim(),
      note: form.note.trim(),
      invoiceId: form.invoiceId || null,
      amount: Number(form.amount) || 0,
    }
    if (!(cleaned.amount > 0) || !cleaned.customerName) return
    if (modal === 'new') addPayment(cleaned)
    else                 updatePayment(modal.edit, cleaned)
    setModal(null)
  }

  const remove = (id) => {
    if (!confirm('Delete this payment?')) return
    deletePayment(id)
  }

  if (loading) return <PageShell><Loading /></PageShell>

  return (
    <PageShell>
      <div className="page-head">
        <button className="icon-btn solid" title="Log payment" onClick={() => openNew()}>
          <Plus size={22} />
        </button>
      </div>

      {status === 'offline' && <OfflineBanner />}

      <SummaryStrip
        cells={[
          { label: 'This Month',   value: money(totals.mtd), color: '#2b7a2e' },
          { label: 'This Year',    value: money(totals.ytd), color: '#2b7a2e' },
          { label: 'All Time',     value: money(totals.all) },
          { label: 'Payments',     value: totals.count },
        ]}
      />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', top: 10, left: 10, color: 'var(--muted)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search customer, invoice #, reference"
            style={{
              width: '100%', padding: '9px 10px 9px 32px', fontSize: 13,
              border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--ink)',
            }}
          />
        </div>
        <MethodChips value={methodFilter} onChange={setMethodFilter} byMethod={totals.byMethod} />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(20,30,45,.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: '#f5f7f8', borderBottom: '1px solid var(--line)' }}>
              <Th>Date</Th>
              <Th>Receipt #</Th>
              <Th>Customer</Th>
              <Th>Invoice</Th>
              <Th>Method</Th>
              <Th>Reference</Th>
              <Th align="right">Amount</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {payments.length === 0 ? 'No payments logged yet. Click + to add one.' : 'No payments match this filter.'}
              </td></tr>
            )}
            {filtered.map((p, idx) => {
              const inv = p.invoiceId ? invoiceById[p.invoiceId] : null
              return (
                <tr key={p.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <Td>{formatDate(p.date)}</Td>
                  <Td style={{ color: 'var(--logo-teal)', fontWeight: 700 }}>{p.receiptNumber}</Td>
                  <Td style={{ fontWeight: 600 }}>{p.customerName}</Td>
                  <Td style={{ color: 'var(--ink-soft)' }}>
                    {inv ? inv.number : <span style={{ color: 'var(--muted)', fontStyle: 'italic' }}>—</span>}
                  </Td>
                  <Td><MethodPill method={p.method} /></Td>
                  <Td style={{ color: 'var(--ink-soft)' }}>{p.reference || '—'}</Td>
                  <Td align="right" style={{ fontWeight: 700, color: '#2b7a2e' }}>{money(p.amount)}</Td>
                  <Td align="center">
                    <IconButton title="Edit" onClick={() => openEdit(p)}><Edit2 size={15} /></IconButton>
                    <IconButton title="Delete" onClick={() => remove(p.id)}><Trash2 size={15} /></IconButton>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <PaymentModal
          form={form}
          setForm={setForm}
          onClose={() => setModal(null)}
          onSave={saveForm}
          onPickInvoice={onPickInvoice}
          isEdit={modal !== 'new'}
          invoices={invoices}
          payments={payments}
          currentPaymentId={modal !== 'new' ? modal.edit : null}
        />
      )}
    </PageShell>
  )
}

function PaymentModal({ form, setForm, onClose, onSave, onPickInvoice, isEdit, invoices, payments, currentPaymentId }) {
  // Show only invoices with an outstanding balance (or the one this
  // payment is currently attached to, so it stays selectable while editing).
  const openInvoices = useMemo(() => {
    const otherPayments = payments.filter(p => p.id !== currentPaymentId)
    return invoices
      .filter(inv => inv.status !== 'void' && inv.status !== 'draft')
      .map(inv => ({ ...inv, _b: invoiceBalance(inv, otherPayments) }))
      .filter(inv => inv._b.balance > 0 || inv.id === form.invoiceId)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }, [invoices, payments, currentPaymentId, form.invoiceId])

  return (
    <Modal title={isEdit ? 'Edit Payment' : 'Log Payment'} onClose={onClose} width={620}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Date">
          <input className="reg-input" type="date" value={form.date} autoFocus
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </Field>
        <Field label="Amount ($)">
          <input className="reg-input" type="number" min="0" step="0.01" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </Field>

        <Field label="Apply To Invoice (Optional)">
          <select className="reg-input" value={form.invoiceId || ''}
            onChange={e => onPickInvoice(e.target.value)}>
            <option value="">— Standalone / No invoice —</option>
            {openInvoices.map(inv => (
              <option key={inv.id} value={inv.id}>
                {inv.number} · {inv.customerName} · {money(inv._b.balance)} due
              </option>
            ))}
          </select>
        </Field>

        <Field label="Customer Name">
          <input className="reg-input" value={form.customerName}
            onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
        </Field>

        <Field label="Method">
          <select className="reg-input" value={form.method}
            onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </Field>

        <Field label="Reference (Cheque #, txn ID, etc.)">
          <input className="reg-input" value={form.reference}
            onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
        </Field>
      </div>

      <div style={{ marginTop: 14 }}>
        <Field label="Note">
          <input className="reg-input" value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
        </Field>
      </div>

      <ModalFooter onClose={onClose} onSave={onSave}
        saveLabel={isEdit ? 'Save Changes' : 'Log Payment'}
        canSave={form.customerName.trim().length > 0 && Number(form.amount) > 0} />
    </Modal>
  )
}

const METHOD_COLORS = {
  'Cash':        { bg: '#e6f5e6', fg: '#2b7a2e' },
  'E-Transfer':  { bg: '#e4f2fb', fg: '#1c6ea4' },
  'Cheque':      { bg: '#f2eaff', fg: '#5b3e9e' },
  'Credit Card': { bg: '#fff0e6', fg: '#9e4e00' },
  'Debit':       { bg: '#fff8db', fg: '#8a6a00' },
  'Other':       { bg: '#eef1f4', fg: '#6B6455' },
}

function MethodPill({ method }) {
  const c = METHOD_COLORS[method] || METHOD_COLORS.Other
  return (
    <span style={{
      display: 'inline-block', padding: '3px 9px', borderRadius: 999,
      background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700,
    }}>{method}</span>
  )
}

function MethodChips({ value, onChange, byMethod }) {
  const chips = [{ key: 'all', label: 'All' }, ...METHODS.map(m => ({ key: m, label: m }))]
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {chips.map(c => (
        <button key={c.key} onClick={() => onChange(c.key)} style={{
          border: `1.5px solid ${value === c.key ? 'var(--logo-teal)' : 'var(--line)'}`,
          background: value === c.key ? '#5FA09E18' : '#fff',
          color: value === c.key ? 'var(--logo-teal)' : 'var(--ink-soft)',
          borderRadius: 999, padding: '5px 12px', fontSize: 12,
          fontWeight: value === c.key ? 700 : 600, cursor: 'pointer',
        }}>
          {c.label} {byMethod[c.key] > 0 && <span style={{ opacity: .7, marginLeft: 4 }}>{money(byMethod[c.key])}</span>}
        </button>
      ))}
    </div>
  )
}
