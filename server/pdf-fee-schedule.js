// ============================================================
// Fee-schedule PDF generator — pure pdfkit, streaming buffer out.
// Draws the Crania-branded "Tuition Schedule" template shown in
// the sample PDF: header row, calendar strip, monthly-installment
// pills, gold reg/mat rows, teal total row, closing paragraph.
// ============================================================
import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/* The PNG first, and it matters: the .jpg is the same mark but JPEG has no
   alpha channel, so the transparent surround was baked to black and the logo
   sat in a black box on a white page. crania-logo.png is RGBA. */
const LOGO_CANDIDATES = [
  path.join(__dirname, '..', 'src', 'assets', 'crania-logo.png'),
  path.join(__dirname, '..', 'src', 'assets', 'crania-logo-black.jpg'),
]
const LOGO_PATH = LOGO_CANDIDATES.find(p => fs.existsSync(p)) || null

const TEAL = '#5FA09E'
const BLUE = '#B6DEF0'
const GOLD = '#DEDA75'
const GRAY = '#d9dee2'
const INK  = '#1f2733'
const SKIP_BG = '#eef1f3'
const SKIP_TX = '#98a1a8'

const MONTH_LONG = {
  sep: 'September', oct: 'October', nov: 'November', dec: 'December',
  jan: 'January',   feb: 'February', mar: 'March',   apr: 'April',
  may: 'May',       jun: 'June',    jul: 'July',    aug: 'August',
}
const MONTH_SHORT = {
  sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec', jan: 'Jan', feb: 'Feb',
  mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun', jul: 'Jul', aug: 'Aug',
}

const money = (n) =>
  '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// yearStart e.g. 2026 → Sep-Dec 2026, Jan-Aug 2027
const calYear = (yearStart) => (m) => (['sep', 'oct', 'nov', 'dec'].includes(m) ? yearStart : yearStart + 1)

export function generateFeeSchedulePdf(data) {
  const {
    studentName = '',
    programName = '',
    yearLabel = '',
    yearStart = 2026,
    weeksPerYear = 35,
    firstLesson = 1,
    scheduledWeeks = 35,
    timeline = [],
    tuition = 0,
    regFee = 0,
    matFee = 0,
    total = 0,
    installments = [],
  } = data

  const yr = calYear(yearStart)

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: 54 })
      const chunks = []
      doc.on('data', (c) => chunks.push(c))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      const left = doc.page.margins.left
      const right = doc.page.width - doc.page.margins.right
      const contentWidth = right - left

      // ── Header ────────────────────────────────────────────
      const headerTop = doc.page.margins.top
      if (LOGO_PATH) {
        try { doc.image(LOGO_PATH, left, headerTop - 6, { height: 62 }) } catch { /* ignore */ }
      }
      doc.font('Helvetica-Bold').fontSize(28).fillColor(INK)
        .text('Tuition Schedule', left, headerTop + 6, { align: 'right', width: contentWidth })
      doc.font('Helvetica').fontSize(12).fillColor('#5a6470')
        .text(yearLabel, left, headerTop + 42, { align: 'right', width: contentWidth })

      let y = headerTop + 72
      doc.moveTo(left, y).lineTo(right, y).lineWidth(1.5).stroke(TEAL)
      y += 18

      // ── Student · Program (bold) / First Week · Scheduled Weeks ──
      doc.font('Helvetica-Bold').fontSize(14).fillColor(INK)
      doc.text(`${studentName}  -  ${programName}`, left, y, { width: contentWidth * 0.65 })
      doc.font('Helvetica').fontSize(11).fillColor(INK)
        .text(
          `First Week: ${firstLesson}   ·   Scheduled Weeks: ${scheduledWeeks}`,
          left, y + 3, { align: 'right', width: contentWidth },
        )
      y += 32

      // ── Meta row ─────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(`${weeksPerYear}-Week Year`, left, y)
      doc.font('Helvetica').fontSize(10).fillColor('#5a6470')
        .text(
          `Tuition Covers ${weeksPerYear} Weeks   ·   Late Starts Are Pro-Rated`,
          left, y + 4, { align: 'right', width: contentWidth },
        )
      y += 28

      /* The calendar strip is optional. When no timeline is supplied it used
         to draw nothing but still advance the cursor 58pt, leaving a band of
         empty page between the header and the installments. */
      if (timeline.length) {
      const gap = 2
      const cellCount = timeline.length
      const cellWidth = (contentWidth - gap * (cellCount - 1)) / cellCount
      const cellHeight = 18

      // Month labels above the strip
      const monthGroups = []
      let cur = null
      timeline.forEach((c, i) => {
        if (!cur || cur.month !== c.month) {
          cur = { month: c.month, start: i, count: 1 }
          monthGroups.push(cur)
        } else {
          cur.count++
        }
      })
      doc.font('Helvetica').fontSize(9).fillColor(INK)
      monthGroups.forEach(g => {
        const x = left + g.start * (cellWidth + gap)
        doc.text(MONTH_SHORT[g.month] || '', x, y, { width: cellWidth * g.count, align: 'left' })
      })
      y += 14

      // Cells
      timeline.forEach((c, i) => {
        const x = left + i * (cellWidth + gap)
        if (c.kind === 'lesson') {
          doc.roundedRect(x, y, cellWidth, cellHeight, 3).fill(TEAL)
          doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8)
            .text(String(c.n), x, y + 5, { width: cellWidth, align: 'center' })
        } else {
          doc.roundedRect(x, y, cellWidth, cellHeight, 3).fill(GRAY)
        }
      })
      y += cellHeight + 4

      // Break labels below the strip (approximate positioning)
      doc.font('Helvetica').fontSize(8).fillColor(INK)
      timeline.forEach((c, i) => {
        if (c.kind === 'break' && c.label) {
          const x = left + i * (cellWidth + gap)
          doc.text(c.label, x - 22, y, { width: 70, align: 'left' })
        }
      })
      y += 22
      }

      /* Two columns, the way the fee panel on screen reads: the summary on
         the left, the month-by-month on the right. As one full-width stack
         this ran to thirteen tall rows, which pushed Material Fee and Total
         onto a second page on their own. */
      const colGap = 22
      const colW = (contentWidth - colGap) / 2
      const rightX = left + colW + colGap
      const bodyTop = y

      const barHeight = 26
      const drawBar = (x, label) => {
        doc.roundedRect(x, y, colW, barHeight, 6).fill(TEAL)
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11.5)
          .text(label, x + 12, y + 8, { width: colW - 24 })
        return y + barHeight + 5
      }

      // One rounded pill: label left, amount right, inside a single column.
      const rowHeight = 22
      const drawPill = (x, yy, label, amount, opts = {}) => {
        const {
          bg = BLUE, tx = INK, labelFont = 'Helvetica-Bold', amtFont = 'Helvetica-Bold', size = 10,
        } = opts
        doc.roundedRect(x, yy, colW, rowHeight, 5).fill(bg)
        doc.fillColor(tx).font(labelFont).fontSize(size)
          .text(label, x + 11, yy + 6.5, { width: colW * 0.62, lineBreak: false })
        doc.font(amtFont).fillColor(tx).fontSize(size)
          .text(amount, x, yy + 6.5, { align: 'right', width: colW - 11 })
        return yy + rowHeight + 4
      }

      // ── Left column: what the year costs ─────────────────
      let ly = drawBar(left, 'Summary')
      ly = drawPill(left, ly, `${weeksPerYear}-Week Year`, `${scheduledWeeks} weeks`,
        { bg: SKIP_BG, tx: INK, labelFont: 'Helvetica', amtFont: 'Helvetica' })
      ly = drawPill(left, ly, 'Tuition', money(tuition))
      ly = drawPill(left, ly, 'Registration Fee', money(regFee), { bg: GOLD })
      ly = drawPill(left, ly, 'Material Fee', money(matFee), { bg: GOLD })
      ly = drawPill(left, ly, 'Total', money(total), { bg: TEAL, tx: '#fff' })

      /* What is due before the first lesson: the last month's fee held as a
         deposit, plus registration and material. */
      const lastPaid = [...installments].reverse().find(i => i.kind !== 'skip' && i.amount > 0)
      const upfront = (lastPaid ? lastPaid.amount : 0) + regFee + matFee
      ly += 4
      doc.font('Helvetica').fontSize(9).fillColor('#5a6470')
        .text('Due before the first lesson', left + 2, ly, { width: colW - 4 })
      ly += 12
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK)
        .text(money(upfront), left + 2, ly, { width: colW - 4 })
      ly += 18

      // ── Right column: month by month ─────────────────────
      let ry = drawBar(rightX, 'Monthly Installments')
      installments.forEach(i => {
        const label = `${MONTH_LONG[i.month]} ${yr(i.month)}`
        if (i.kind === 'skip') {
          ry = drawPill(rightX, ry, label, '—',
            { bg: SKIP_BG, tx: SKIP_TX, labelFont: 'Helvetica', amtFont: 'Helvetica' })
        } else {
          ry = drawPill(rightX, ry, label + (i.kind === 'prorated' ? '  · pro-rated' : ''), money(i.amount))
        }
      })

      y = Math.max(ly, ry, bodyTop) + 14

      // Closing paragraph
      doc.font('Helvetica').fontSize(10).fillColor(INK)
      const para = `The full year tuition covers ${weeksPerYear} scheduled weeks. No fees are charged during holiday and break closures.\nIf a student starts mid-year, the first month's fees are pro-rated.`
      doc.text(para, left, y, { width: contentWidth })
      y += doc.heightOfString(para, { width: contentWidth }) + 12

      // "See the Calendar for scheduled lesson dates."
      doc.fillColor(INK).text('See the ', left, y, { continued: true })
      doc.fillColor(TEAL).text('Calendar', { continued: true, underline: true })
      doc.fillColor(INK).text(' for scheduled lesson dates.', { underline: false })
      y += 24

      // Footer
      const footerY = doc.page.height - doc.page.margins.bottom - 20
      doc.moveTo(left, footerY - 8).lineTo(right, footerY - 8).lineWidth(1.5).stroke(TEAL)
      doc.font('Helvetica').fontSize(9).fillColor('#5a6470')
        .text(`© ${yearStart} Crania Schools`, left, footerY, { align: 'center', width: contentWidth })

      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
