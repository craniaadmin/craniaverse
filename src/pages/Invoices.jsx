import { useCallback, useMemo, useState } from 'react'
import { Plus, X, Edit2, Trash2, Search } from 'lucide-react'
import {
  useFinance, money, todayISO, formatDate,
  invoiceBalance, invoiceStatus, STATUS_STYLE, genId,
} from '../data/finance'
import {
  PageShell, Loading, OfflineBanner, SummaryStrip,
  Th, Td, IconButton, StatusPill, Modal, ModalFooter, Field, FieldLabel,
} from '../components/FinanceUI'
import PageActions, { RowCount } from '../components/PageActions'
import useHistory from '../data/useHistory'

const BLANK_LINE = () => ({ id: genId('li'), desc: '', qty: 1, unitPrice: 0 })

const BLANK_INV = () => ({
  id: null,
  number: '',
  date: todayISO(),
  dueDate: '',
  customerName: '',
  customerEmail: '',
  studentName: '',
  program: '',
  lineItems: [BLANK_LINE()],
  notes: '',
  status: 'sent', // 'draft' | 'sent' | 'void' — 'paid' / 'partial' / 'overdue' are derived
})

const STATUS_ORDER = ['sent', 'overdue', 'partial', 'paid', 'draft', 'void']

export default function Invoices() {
  const {
    data, invoices, payments, loading, status, refresh,
    updateData, addInvoice, updateInvoice, deleteInvoice,
  } = useFinance()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modal, setModal] = useState(null) // null | 'new' | { edit: id }
  const [form, setForm] = useState(BLANK_INV())

  /* Undo/redo over the finance payload as a whole — see
     src/data/useHistory.js. Snapshots suit this page: it already loads and
     saves one blob, so putting an earlier one back is the same write any
     other edit makes, and it restores the invoice numbering counter and
     the payments a delete detached along with the invoices themselves.

     Every hook has to be called before the `if (loading)` return below. A
     hook that only runs once the data has arrived is a "rendered more
     hooks than during the previous render" crash on the second render,
     and the page dies on open. Keep them all up here.

     Disabled while loading, so arriving data is not itself recorded as a
     change — otherwise Undo is armed the moment the page opens and takes
     you back to an empty ledger. */
  const applyPayload = useCallback((snap) => {
    updateData(d => {
      d.invoices = snap.invoices || []
      d.payments = snap.payments || []
      d.meta = { ...(snap.meta || {}) }
    })
  }, [updateData])
  const hist = useHistory(data, applyPayload, { label: 'invoice change', enabled: !loading })

  const decorated = useMemo(() => invoices.map(inv => ({
    ...inv,
    _s: invoiceStatus(inv, payments),
    _b: invoiceBalance(inv, payments),
  })), [invoices, payments])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return decorated
      .filter(inv => statusFilter === 'all' ? true : inv._s === statusFilter)
      .filter(inv => !q ||
        inv.customerName?.toLowerCase().includes(q) ||
        inv.studentName?.toLowerCase().includes(q) ||
        inv.number?.toLowerCase().includes(q))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [decorated, statusFilter, query])

  const totals = useMemo(() => {
    const now = new Date()
    let invoiced = 0, collected = 0, outstanding = 0, overdueCount = 0
    for (const inv of decorated) {
      if (inv._s === 'void') continue
      invoiced += inv._b.total
      collected += inv._b.applied
      outstanding += inv._b.balance
      if (inv._s === 'overdue') overdueCount++
    }
    return { invoiced, collected, outstanding, overdueCount, count: decorated.filter(i => i._s !== 'void').length, now }
  }, [decorated])

  const openNew = () => {
    setForm(BLANK_INV())
    setModal('new')
  }

  const openEdit = (inv) => {
    setForm({
      ...BLANK_INV(),
      ...inv,
      lineItems: inv.lineItems?.length ? inv.lineItems.map(li => ({ ...li, id: li.id || genId('li') })) : [BLANK_LINE()],
    })
    setModal({ edit: inv.id })
  }

  const saveForm = () => {
    const cleaned = {
      ...form,
      customerName: form.customerName.trim(),
      customerEmail: form.customerEmail.trim(),
      studentName: form.studentName.trim(),
      program: form.program.trim(),
      notes: form.notes.trim(),
      lineItems: form.lineItems
        .map(li => ({ ...li, desc: li.desc.trim(), qty: Number(li.qty) || 0, unitPrice: Number(li.unitPrice) || 0 }))
        .filter(li => li.desc || li.qty || li.unitPrice),
    }
    const total = cleaned.lineItems.reduce((s, li) => s + li.qty * li.unitPrice, 0)
    cleaned.total = total
    if (!cleaned.customerName) return
    if (modal === 'new') addInvoice(cleaned)
    else                 updateInvoice(modal.edit, cleaned)
    setModal(null)
  }

  const remove = (id) => {
    if (!confirm('Delete this invoice? Any payments linked to it will remain but become unlinked.')) return
    deleteInvoice(id)
  }

  const formTotal = form.lineItems.reduce((s, li) => s + (Number(li.qty) || 0) * (Number(li.unitPrice) || 0), 0)

  if (loading) return <PageShell><Loading /></PageShell>

  return (
    <PageShell>

      <PageActions
        {...hist}
        csvName="crania-invoices"
        csvColumns={[
          { key: 'number', label: 'Invoice #' },
          { key: 'date', label: 'Date' },
          { key: 'dueDate', label: 'Due Date' },
          { key: 'customerName', label: 'Customer' },
          { key: 'customerEmail', label: 'Customer Email' },
          { key: 'studentName', label: 'Student' },
          { key: 'program', label: 'Program' },
          { key: 'total', label: 'Total' },
          { key: 'paid', label: 'Paid' },
          { key: 'balance', label: 'Balance' },
          { key: 'status', label: 'Status' },
          { key: 'notes', label: 'Notes' },
        ]}
        csvRows={() => filtered.map(inv => ({
          number: inv.number || '',
          date: inv.date || '',
          dueDate: inv.dueDate || '',
          customerName: inv.customerName || '',
          customerEmail: inv.customerEmail || '',
          studentName: inv.studentName || '',
          program: inv.program || '',
          total: inv._b.total,
          paid: inv._b.applied,
          balance: inv._b.balance,
          status: STATUS_STYLE[inv._s]?.label || inv._s,
          notes: inv.notes || '',
        }))}
        backupCollection="finance"
        backupHint="Snapshots of every invoice and payment (last 14 kept)."
        onRestored={refresh}
      >
        <button className="icon-btn solid" title="New invoice" onClick={openNew}>
          <Plus size={22} />
        </button>
        <button title="Create a new invoice" onClick={openNew}>
          <Plus size={13} /> New Invoice
        </button>
      </PageActions>

      {status === 'offline' && <OfflineBanner />}

      <SummaryStrip
        cells={[
          { label: 'Invoiced',      value: money(totals.invoiced) },
          { label: 'Collected',     value: money(totals.collected), color: '#2b7a2e' },
          { label: 'Outstanding',   value: money(totals.outstanding), color: totals.outstanding > 0 ? '#8a6a00' : 'var(--ink)' },
          { label: 'Overdue',       value: totals.overdueCount, color: totals.overdueCount > 0 ? '#a12626' : 'var(--ink)' },
        ]}
      />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', top: 10, left: 10, color: 'var(--muted)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search customer, student, invoice #"
            style={{
              width: '100%', padding: '9px 10px 9px 32px', fontSize: 13,
              border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--ink)',
            }}
          />
        </div>
        <StatusChips value={statusFilter} onChange={setStatusFilter} decorated={decorated} />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(20,30,45,.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: '#f5f7f8', borderBottom: '1px solid var(--line)' }}>
              <Th>#</Th>
              <Th>Date</Th>
              <Th>Customer / Student</Th>
              <Th>Program</Th>
              <Th align="right">Total</Th>
              <Th align="right">Paid</Th>
              <Th align="right">Balance</Th>
              <Th align="center">Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {invoices.length === 0 ? 'No invoices yet. Click + to create one.' : 'No invoices match this filter.'}
              </td></tr>
            )}
            {filtered.map((inv, idx) => (
              <tr key={inv.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid var(--line)' : 'none' }}>
                <Td style={{ fontWeight: 700, color: 'var(--logo-teal)' }}>{inv.number}</Td>
                <Td>{formatDate(inv.date)}</Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>{inv.customerName}</div>
                  {inv.studentName && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{inv.studentName}</div>}
                </Td>
                <Td style={{ color: 'var(--ink-soft)' }}>{inv.program || '—'}</Td>
                <Td align="right">{money(inv._b.total)}</Td>
                <Td align="right" style={{ color: inv._b.applied > 0 ? '#2b7a2e' : 'var(--muted)' }}>
                  {money(inv._b.applied)}
                </Td>
                <Td align="right" style={{ fontWeight: 700, color: inv._b.balance > 0 ? 'var(--ink)' : 'var(--muted)' }}>
                  {money(inv._b.balance)}
                </Td>
                <Td align="center"><StatusPill s={inv._s} /></Td>
                <Td align="center">
                  <IconButton title="Edit" onClick={() => openEdit(inv)}><Edit2 size={15} /></IconButton>
                  <IconButton title="Delete" onClick={() => remove(inv.id)}><Trash2 size={15} /></IconButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <InvoiceModal
          form={form}
          setForm={setForm}
          onClose={() => setModal(null)}
          onSave={saveForm}
          formTotal={formTotal}
          isEdit={modal !== 'new'}
        />
      )}
    </PageShell>
  )
}

function InvoiceModal({ form, setForm, onClose, onSave, formTotal, isEdit }) {
  const setLine = (id, patch) => setForm(f => ({
    ...f,
    lineItems: f.lineItems.map(li => li.id === id ? { ...li, ...patch } : li),
  }))
  const addLine = () => setForm(f => ({ ...f, lineItems: [...f.lineItems, BLANK_LINE()] }))
  const rmLine  = (id) => setForm(f => ({ ...f, lineItems: f.lineItems.filter(li => li.id !== id) }))

  return (
    <Modal title={isEdit ? 'Edit Invoice' : 'New Invoice'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Customer Name">
          <input className="reg-input" value={form.customerName} autoFocus
            onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
        </Field>
        <Field label="Customer Email">
          <input className="reg-input" type="email" value={form.customerEmail}
            onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
        </Field>
        <Field label="Student">
          <input className="reg-input" value={form.studentName}
            onChange={e => setForm(f => ({ ...f, studentName: e.target.value }))} />
        </Field>
        <Field label="Program">
          <input className="reg-input" value={form.program}
            onChange={e => setForm(f => ({ ...f, program: e.target.value }))} />
        </Field>
        <Field label="Invoice Date">
          <input className="reg-input" type="date" value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </Field>
        <Field label="Due Date">
          <input className="reg-input" type="date" value={form.dueDate}
            onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
        </Field>
      </div>

      {/* Line items */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <FieldLabel>Line Items</FieldLabel>
          <button className="btn ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={addLine}>+ Add Row</button>
        </div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead style={{ background: '#f5f7f8' }}>
              <tr>
                <Th>Description</Th>
                <Th align="center" style={{ width: 70 }}>Qty</Th>
                <Th align="right" style={{ width: 110 }}>Unit Price</Th>
                <Th align="right" style={{ width: 110 }}>Amount</Th>
                <Th style={{ width: 36 }}></Th>
              </tr>
            </thead>
            <tbody>
              {form.lineItems.map(li => (
                <tr key={li.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <Td>
                    <input className="reg-input" value={li.desc} placeholder="e.g. Sep Tuition"
                      onChange={e => setLine(li.id, { desc: e.target.value })}
                      style={{ border: 'none', padding: '6px 4px' }} />
                  </Td>
                  <Td align="center">
                    <input className="reg-input" type="number" min="0" step="1" value={li.qty}
                      onChange={e => setLine(li.id, { qty: e.target.value })}
                      style={{ border: 'none', padding: '6px 4px', textAlign: 'center', width: 60 }} />
                  </Td>
                  <Td align="right">
                    <input className="reg-input" type="number" min="0" step="0.01" value={li.unitPrice}
                      onChange={e => setLine(li.id, { unitPrice: e.target.value })}
                      style={{ border: 'none', padding: '6px 4px', textAlign: 'right', width: 100 }} />
                  </Td>
                  <Td align="right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {money((Number(li.qty) || 0) * (Number(li.unitPrice) || 0))}
                  </Td>
                  <Td align="center">
                    <IconButton title="Remove" onClick={() => rmLine(li.id)} disabled={form.lineItems.length === 1}>
                      <X size={14} />
                    </IconButton>
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid var(--line)', background: '#fafbfc' }}>
                <Td colSpan={3} align="right" style={{ fontWeight: 700, color: 'var(--ink-soft)' }}>Total</Td>
                <Td align="right" style={{ fontWeight: 800, fontSize: 15 }}>{money(formTotal)}</Td>
                <Td></Td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Status">
          <select className="reg-input" value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="void">Void</option>
          </select>
        </Field>
        <Field label="Notes">
          <input className="reg-input" value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </Field>
      </div>

      <ModalFooter onClose={onClose} onSave={onSave} saveLabel={isEdit ? 'Save Changes' : 'Create Invoice'}
        canSave={form.customerName.trim().length > 0 && form.lineItems.some(li => (Number(li.qty) * Number(li.unitPrice)) > 0)} />
    </Modal>
  )
}

function StatusChips({ value, onChange, decorated }) {
  const counts = decorated.reduce((acc, inv) => {
    acc[inv._s] = (acc[inv._s] || 0) + 1
    acc.all += 1
    return acc
  }, { all: 0 })
  const chips = [{ key: 'all', label: 'All' }, ...STATUS_ORDER.map(k => ({ key: k, label: STATUS_STYLE[k].label }))]
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
          {c.label} {counts[c.key] > 0 && <span style={{ opacity: .7, marginLeft: 4 }}>{counts[c.key]}</span>}
        </button>
      ))}
    </div>
  )
}

