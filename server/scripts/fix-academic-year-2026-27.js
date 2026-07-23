// One-off, reviewable migration for a systemic bug: registration
// program tabs, and their scheduled lesson dates, were always
// stamped with a hardcoded '25_26' academic year regardless of when
// the registration actually happened (in server.js's legacy-record
// migration, server/mapping.js's demo seed, and Students.jsx's
// "add program tab" default). As of today that's simply wrong — the
// current/upcoming school year is '26_27' — and every lesson date
// generated under the old flat-cadence guesser was wrong too (it
// didn't know about real closures like Winter Break).
//
// Both root causes are already fixed in code (see scheduleUtils.js's
// currentAcademicYear() + calendar-based week dates). This script
// repairs EXISTING data in the live database to match.
//
// SAFE BY DEFAULT — dry run unless you pass --apply:
//   node server/scripts/fix-academic-year-2026-27.js            (dry run, default)
//   node server/scripts/fix-academic-year-2026-27.js --apply    (writes changes)
//
// Only auto-fixes program tabs whose saved comments rows are
// completely blank — no attendance, no uniform, no notes ever
// entered anywhere in the tab. Any tab with real data already
// recorded in it is left completely untouched and printed under
// "SKIPPED (has data — review manually)" instead, because silently
// reshuffling dates under real recorded attendance would be data
// loss, not a fix.
//
// For fixed tabs: the registration's `programs[].year` is updated
// from '25_26' to '26_27', the comments row is regenerated under the
// new tab key using the REAL Calendar "Afterschool" week dates (so
// breaks are correctly skipped), and the old, now-orphaned
// '25_26|PROGRAM' comments row is deleted.
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import {
  pb, loadRegistrations, loadComments, loadPrograms, loadCalendar,
  saveCommentsForTab,
} from '../pb.js'
import {
  buildScheduledRows, tabKeyOf, currentAcademicYear, weekDatesFromCalendarEvents,
} from '../../src/data/scheduleUtils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const STALE_YEAR = '25_26'
const NEW_YEAR = currentAcademicYear()
const APPLY = process.argv.includes('--apply')

const COMMENT_FIELDS = [
  'attendance', 'uniform', 'lessonPlan', 'homeworkCompleted',
  'performance', 'behaviour', 'homeworkAssigned', 'parentComm', 'teacher',
]
function rowIsBlank(row) {
  return COMMENT_FIELDS.every(f => !String(row?.[f] || '').trim())
}
function studentName(rec) {
  return `${rec.student?.firstName || ''} ${rec.student?.lastName || ''}`.trim() || rec.id
}

async function main() {
  console.log(`[migrate] stale year "${STALE_YEAR}" -> "${NEW_YEAR}"  |  mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no changes will be made)'}`)
  console.log('')

  const registrations = await loadRegistrations()
  const commentsMap = await loadComments() // { [studentId]: { [tabKey]: rows[] } }
  const programCatalog = await loadPrograms()
  const calendar = await loadCalendar()

  const afterschool = (calendar.calendars || []).find(c => /afterschool/i.test(c.name || ''))
  if (!afterschool) {
    console.error('[migrate] No "Afterschool" calendar found — cannot compute real lesson dates. Aborting.')
    process.exit(1)
  }
  const weekDates = weekDatesFromCalendarEvents(calendar.events || [], afterschool.id)
  if (!weekDates[1]) {
    console.error('[migrate] Afterschool calendar has no "Week 1" marker — cannot compute term start. Aborting.')
    process.exit(1)
  }
  console.log(`[migrate] Using Afterschool calendar "Week 1" = ${weekDates[1]}, "Week 35" = ${weekDates[35] || '(fewer than 35 weeks defined)'}`)
  console.log('')

  const toFix = []   // { rec, tabIdx, oldTab, newTab, newRows }
  const toSkip = []  // { rec, tab, nonBlankCount }

  for (const rec of registrations) {
    if (rec.id === 'seed') continue
    const tabs = Array.isArray(rec.programs) ? rec.programs : []
    tabs.forEach((tab, tabIdx) => {
      if (tab.year !== STALE_YEAR || !tab.program) return
      const oldKey = tabKeyOf(tab)
      const oldRows = commentsMap[rec.id]?.[oldKey] || []
      const blank = oldRows.length === 0 || oldRows.every(rowIsBlank)
      if (blank) {
        const newTab = { ...tab, year: NEW_YEAR }
        const newRows = buildScheduledRows(newTab, programCatalog, weekDates)
        toFix.push({ rec, tabIdx, oldTab: tab, newTab, oldKey, newKey: tabKeyOf(newTab), newRows })
      } else {
        const nonBlankCount = oldRows.filter(r => !rowIsBlank(r)).length
        toSkip.push({ rec, tab, nonBlankCount, totalRows: oldRows.length })
      }
    })
  }

  console.log(`[migrate] ${toFix.length} tab(s) will be ${APPLY ? 'fixed' : 'planned for fixing'}:`)
  for (const f of toFix) {
    console.log(`  - ${studentName(f.rec)} — "${f.oldTab.program}" (${f.oldKey} -> ${f.newKey}), ${f.newRows.length} lessons regenerated`)
  }
  console.log('')
  console.log(`[migrate] ${toSkip.length} tab(s) SKIPPED (has data — review manually):`)
  for (const s of toSkip) {
    console.log(`  - ${studentName(s.rec)} — "${s.tab.program}" (${tabKeyOf(s.tab)}): ${s.nonBlankCount}/${s.totalRows} rows have data`)
  }
  console.log('')

  if (!APPLY) {
    console.log('[migrate] Dry run complete — no changes were made. Re-run with --apply to write these changes.')
    return
  }
  if (toFix.length === 0) {
    console.log('[migrate] Nothing to apply.')
    return
  }

  // Raw PB rows for targeted, minimal-blast-radius writes (only the
  // records that actually changed — not a full-table rewrite).
  const regRows = await pb().collection('registrations').getFullList({ batch: 500 })
  const regByRecordId = new Map(regRows.map(r => [r.recordId, r]))
  const commentRows = await pb().collection('comments').getFullList({ batch: 500 })
  const findCommentRow = (studentId, tabKey) =>
    commentRows.find(r => r.studentId === studentId && r.tabKey === tabKey)

  // Group fixes by registration so each record is only written once
  // even if it has multiple stale tabs.
  const byRecordIdFixes = new Map()
  for (const f of toFix) {
    if (!byRecordIdFixes.has(f.rec.id)) byRecordIdFixes.set(f.rec.id, [])
    byRecordIdFixes.get(f.rec.id).push(f)
  }

  let regWrites = 0, commentWrites = 0, commentDeletes = 0
  for (const [recordId, fixes] of byRecordIdFixes) {
    const rec = fixes[0].rec
    const patchedPrograms = [...rec.programs]
    for (const f of fixes) patchedPrograms[f.tabIdx] = f.newTab
    const patchedPayload = { ...rec, programs: patchedPrograms }

    const row = regByRecordId.get(String(recordId))
    if (!row) {
      console.warn(`  ! could not find PocketBase row for registration ${recordId} (${studentName(rec)}) — skipping its programs update`)
    } else {
      await pb().collection('registrations').update(row.id, { payload: patchedPayload })
      regWrites++
    }

    for (const f of fixes) {
      await saveCommentsForTab(recordId, f.newKey, f.newRows)
      commentWrites++
      const oldRow = findCommentRow(recordId, f.oldKey)
      if (oldRow) {
        await pb().collection('comments').delete(oldRow.id)
        commentDeletes++
      }
    }
  }

  console.log(`[migrate] Done. Updated ${regWrites} registration(s), wrote ${commentWrites} new comments row(s), removed ${commentDeletes} stale comments row(s).`)
  if (toSkip.length > 0) {
    console.log(`[migrate] ${toSkip.length} tab(s) were left untouched — see "SKIPPED" list above. Fix those manually on the Student page if needed.`)
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err?.message || err)
  process.exit(1)
})
