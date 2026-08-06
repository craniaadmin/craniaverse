import { useMemo, useState } from 'react'
import { Printer, Search, FileText } from 'lucide-react'
import { useFinance, money, formatDate } from '../data/finance'
import {
  PageShell, Loading, OfflineBanner, SummaryStrip,
  Th, Td, IconButton, Modal,
} from '../components/FinanceUI'

export default function Receipts() {
  const { invoices, payments, loading, status } = useFinance()
  const [query, setQuery] = useState('')
  const [viewing, setViewing] = useState(null) // payment being previewed

  const invoiceById = useMemo(() => Object.fromEntries(invoices.map(i => [i.id, i])), [invoices])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return payments
      .filter(p => !q ||
        p.customerName?.toLowerCase().includes(q) ||
        p.receiptNumber?.toLowerCase().includes(q) ||
        invoiceById[p.invoiceId]?.number?.toLowerCase().includes(q))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [payments, query, invoiceById])

  const totals = useMemo(() => {
    const nowY = new Date().getFullYear()
    let ytdCount = 0, ytdAmt = 0
    for (const p of payments) {
      const d = new Date(p.date + 'T00:00:00')
      if (!Number.isNaN(d.getTime()) && d.getFullYear() === nowY) {
        ytdCount++
        ytdAmt += Number(p.amount || 0)
      }
    }
    return { total: payments.length, ytdCount, ytdAmt }
  }, [payments])

  if (loading) return <PageShell><Loading /></PageShell>

  return (
    <PageShell>
      <div className="page-head">
      </div>

      {status === 'offline' && <OfflineBanner />}

      <SummaryStrip
        cells={[
          { label: 'Total Receipts', value: totals.total },
          { label: 'Issued YTD',     value: totals.ytdCount },
          { label: 'Amount YTD',     value: money(totals.ytdAmt), color: '#2b7a2e' },
        ]}
      />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={15} style={{ position: 'absolute', top: 10, left: 10, color: 'var(--muted)' }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search receipt #, customer, invoice #"
            style={{
              width: '100%', padding: '9px 10px 9px 32px', fontSize: 13,
              border: '1px solid var(--line)', borderRadius: 8, background: '#fff', color: 'var(--ink)',
            }}
          />
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 12 }}>
          Receipts are generated automatically for each payment.
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(20,30,45,.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: '#f5f7f8', borderBottom: '1px solid var(--line)' }}>
              <Th>Receipt #</Th>
              <Th>Date</Th>
              <Th>Customer</Th>
              <Th>Invoice</Th>
              <Th>Method</Th>
              <Th align="right">Amount</Th>
              <Th align="center">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                {payments.length === 0
                  ? 'No receipts yet — log a payment to generate one.'
                  : 'No receipts match this search.'}
              </td></tr>
            )}
            {filtered.map((p, idx) => {
              const inv = p.invoiceId ? invoiceById[p.invoiceId] : null
              return (
                <tr key={p.id} style={{ borderBottom: idx < filtered.length - 1 ? '1px solid var(--line)' : 'none' }}>
                  <Td style={{ fontWeight: 700, color: 'var(--logo-teal)' }}>{p.receiptNumber}</Td>
                  <Td>{formatDate(p.date)}</Td>
                  <Td style={{ fontWeight: 600 }}>{p.customerName}</Td>
                  <Td style={{ color: 'var(--ink-soft)' }}>{inv?.number || '—'}</Td>
                  <Td style={{ color: 'var(--ink-soft)' }}>{p.method}</Td>
                  <Td align="right" style={{ fontWeight: 700 }}>{money(p.amount)}</Td>
                  <Td align="center">
                    <IconButton title="View receipt" onClick={() => setViewing(p)}><FileText size={15} /></IconButton>
                    <IconButton title="Print" onClick={() => { setViewing(p); setTimeout(() => window.print(), 200) }}><Printer size={15} /></IconButton>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {viewing && (
        <ReceiptPreview
          payment={viewing}
          invoice={viewing.invoiceId ? invoiceById[viewing.invoiceId] : null}
          onClose={() => setViewing(null)}
        />
      )}
    </PageShell>
  )
}

function ReceiptPreview({ payment, invoice, onClose }) {
  return (
    <Modal title={`Receipt ${payment.receiptNumber}`} onClose={onClose} width={640}>
      <div id="receipt-print-area" style={{
        border: '1px solid var(--line)', borderRadius: 10, padding: 32, background: '#fff',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 700, color: 'var(--logo-teal)' }}>
              Crania Schools
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
              234 The Boardwalk, Suite 301<br />
              Waterloo, ON N2T 2N4<br />
              519-781-8810
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>RECEIPT</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 6 }}>#{payment.receiptNumber}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{formatDate(payment.date)}</div>
          </div>
        </div>

        <div style={{ borderTop: '2px solid var(--logo-teal)', margin: '20px 0' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Received From</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{payment.customerName}</div>
          </div>
          {invoice && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>For Invoice</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{invoice.number}</div>
              {invoice.studentName && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{invoice.studentName} · {invoice.program}</div>}
            </div>
          )}
        </div>

        <div style={{
          background: '#f8f9fa', border: '1px solid var(--line)', borderRadius: 8,
          padding: '18px 22px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Amount Received</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: '#2b7a2e' }}>{money(payment.amount)}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13, color: 'var(--ink-soft)' }}>
            <span>Method: <strong style={{ color: 'var(--ink)' }}>{payment.method}</strong></span>
            {payment.reference && <span>Ref: <strong style={{ color: 'var(--ink)' }}>{payment.reference}</strong></span>}
          </div>
        </div>

        {payment.note && (
          <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--ink-soft)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>Notes</div>
            {payment.note}
          </div>
        )}

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid var(--line)', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
          Thank you for your payment.
        </div>
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={15} style={{ marginRight: 6, verticalAlign: -3 }} /> Print
        </button>
      </div>

      {/* Print-only styles: hide everything except the receipt */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #receipt-print-area, #receipt-print-area * { visibility: visible !important; }
          #receipt-print-area {
            position: absolute; left: 0; top: 0; width: 100%;
            border: none !important; padding: 40px !important;
          }
        }
      `}</style>
    </Modal>
  )
}
