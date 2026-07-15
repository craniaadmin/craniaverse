// ============================================================
// Finance store — shared by the Accounting / Payments / Invoices
// / Receipts pages. The server holds a single JSON payload at
// GET /api/finance :
//   { invoices: [], payments: [], meta: { nextInvoiceNumber, nextReceiptNumber } }
// This hook loads it, exposes updater helpers, and PUTs the whole
// blob back on every change. Volume is small enough (a school's
// yearly worth of tx) that a full-payload write is fine.
// ============================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const ENDPOINT = `${API_BASE}/api/finance`
const HEADERS  = { 'ngrok-skip-browser-warning': 'true' }

export const money = (n) =>
  '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const parseDate = (s) => {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

export const daysBetween = (a, b) => {
  const A = parseDate(a); const B = parseDate(b)
  if (!A || !B) return 0
  return Math.round((B - A) / (24 * 60 * 60 * 1000))
}

export const formatDate = (s) => {
  const d = parseDate(s)
  if (!d) return s || ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// A payment is applied to an invoice when payment.invoiceId === invoice.id.
// Standalone payments (no invoiceId) are counted in totals but don't
// reduce any invoice's balance.
export function invoiceBalance(invoice, payments) {
  const total = Number(invoice?.total || 0)
  const applied = payments
    .filter(p => p.invoiceId === invoice.id)
    .reduce((s, p) => s + Number(p.amount || 0), 0)
  return { total, applied, balance: Math.max(0, total - applied) }
}

// Derived status: 'void' | 'draft' if user-set, otherwise
// 'paid' | 'partial' | 'overdue' | 'sent'.
export function invoiceStatus(invoice, payments, now = new Date()) {
  if (invoice.status === 'void')  return 'void'
  if (invoice.status === 'draft') return 'draft'
  const { total, applied } = invoiceBalance(invoice, payments)
  if (applied >= total && total > 0) return 'paid'
  if (applied > 0)                   return 'partial'
  const due = parseDate(invoice.dueDate)
  if (due && due < now)              return 'overdue'
  return 'sent'
}

export const STATUS_STYLE = {
  draft:   { label: 'Draft',    bg: '#eef1f4', fg: '#5b6573' },
  sent:    { label: 'Sent',     bg: '#e4f2fb', fg: '#1c6ea4' },
  partial: { label: 'Partial',  bg: '#fff4d6', fg: '#8a6a00' },
  paid:    { label: 'Paid',     bg: '#dff5e0', fg: '#2b7a2e' },
  overdue: { label: 'Overdue',  bg: '#fde0e0', fg: '#a12626' },
  void:    { label: 'Void',     bg: '#f3f3f3', fg: '#8b95a3' },
}

// Fetches once, then PUTs the whole payload on any change.
// Debounces writes so a burst of edits doesn't hammer the server.
export function useFinance() {
  const [data, setData] = useState({ invoices: [], payments: [], meta: { nextInvoiceNumber: 1001, nextReceiptNumber: 1001 } })
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('loading') // loading | online | offline
  const saveTimer = useRef(null)
  const latest = useRef(data)
  latest.current = data

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINT, { headers: HEADERS })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      setData({
        invoices: Array.isArray(j.invoices) ? j.invoices : [],
        payments: Array.isArray(j.payments) ? j.payments : [],
        meta: {
          nextInvoiceNumber: Number(j.meta?.nextInvoiceNumber) || 1001,
          nextReceiptNumber: Number(j.meta?.nextReceiptNumber) || 1001,
        },
      })
      setStatus('online')
    } catch {
      setStatus('offline')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const updateData = useCallback((mut) => {
    setData(prev => {
      const draft = {
        invoices: [...prev.invoices],
        payments: [...prev.payments],
        meta:     { ...prev.meta },
      }
      mut(draft)
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch(ENDPOINT, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...HEADERS },
          body: JSON.stringify(latest.current),
        }).catch(() => {})
      }, 350)
      return draft
    })
  }, [])

  // Convenience wrappers ----
  const addInvoice = useCallback((inv) => {
    updateData(d => {
      const n = d.meta.nextInvoiceNumber
      d.invoices.push({ ...inv, id: inv.id || genId('inv'), number: inv.number || `INV-${n}` })
      if (!inv.number) d.meta.nextInvoiceNumber = n + 1
    })
  }, [updateData])

  const updateInvoice = useCallback((id, patch) => {
    updateData(d => {
      const i = d.invoices.findIndex(x => x.id === id)
      if (i !== -1) d.invoices[i] = { ...d.invoices[i], ...patch }
    })
  }, [updateData])

  const deleteInvoice = useCallback((id) => {
    updateData(d => {
      d.invoices = d.invoices.filter(x => x.id !== id)
      // Detach payments that pointed at this invoice; keep them so the
      // money stays on the books but they become standalone entries.
      d.payments = d.payments.map(p => p.invoiceId === id ? { ...p, invoiceId: null } : p)
    })
  }, [updateData])

  const addPayment = useCallback((pay) => {
    updateData(d => {
      const n = d.meta.nextReceiptNumber
      d.payments.push({ ...pay, id: pay.id || genId('pay'), receiptNumber: pay.receiptNumber || `R-${n}` })
      if (!pay.receiptNumber) d.meta.nextReceiptNumber = n + 1
    })
  }, [updateData])

  const updatePayment = useCallback((id, patch) => {
    updateData(d => {
      const i = d.payments.findIndex(x => x.id === id)
      if (i !== -1) d.payments[i] = { ...d.payments[i], ...patch }
    })
  }, [updateData])

  const deletePayment = useCallback((id) => {
    updateData(d => { d.payments = d.payments.filter(x => x.id !== id) })
  }, [updateData])

  return useMemo(() => ({
    data, loading, status, refresh,
    invoices: data.invoices, payments: data.payments, meta: data.meta,
    addInvoice, updateInvoice, deleteInvoice,
    addPayment, updatePayment, deletePayment,
  }), [data, loading, status, refresh, addInvoice, updateInvoice, deleteInvoice, addPayment, updatePayment, deletePayment])
}

let idCounter = 0
export function genId(prefix = 'id') {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`
}
