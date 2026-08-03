// ============================================================
// Enrolments naming a program the catalogue does not have.
// ------------------------------------------------------------
// These sit on a student's record but match no program, so they
// appear on no roster and in no class count — the student is
// booked into something that does not exist.
//
// Most were created before the Students page stopped offering the
// six demo programs from mockData.js. That cause is fixed, so the
// list should not grow; what is here is historical.
//
// Read-only by default. Repointing is deliberately explicit — the
// script suggests matches but never guesses on your behalf, because
// moving a child into the wrong class is worse than leaving the
// record obviously broken:
//
//   node server/scripts/report-enrolments.js
//   node server/scripts/report-enrolments.js --map "Old Name=REAL NAME" --apply
//
// --delete throws them away instead of repointing. It removes the
// enrolment from the student, never the student: someone whose only
// enrolment was an orphan stays on the roll with no classes, which is
// what they in fact are.
//
//   node server/scripts/report-enrolments.js --delete
//   node server/scripts/report-enrolments.js --delete --apply
//
// Requires server/.env: PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD
// ============================================================
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import PocketBase from 'pocketbase'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVER_DIR = path.join(__dirname, '..')
dotenv.config({ path: path.join(SERVER_DIR, '.env') })

const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090'
const EMAIL = process.env.PB_ADMIN_EMAIL
const PASSWORD = process.env.PB_ADMIN_PASSWORD
const APPLY = process.argv.includes('--apply')
const DELETE = process.argv.includes('--delete')

// --map "Old=New" may be repeated.
const MAP = new Map()
process.argv.forEach((a, i) => {
  if (a !== '--map') return
  const pair = process.argv[i + 1] || ''
  const eq = pair.indexOf('=')
  if (eq > 0) MAP.set(pair.slice(0, eq).trim().toUpperCase(), pair.slice(eq + 1).trim())
})

if (!EMAIL || !PASSWORD) {
  console.error('✗ PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD must be set in server/.env')
  process.exit(1)
}

const pb = new PocketBase(PB_URL)
pb.autoCancellation(false)

const norm = (s) => String(s || '').trim().toUpperCase()
// Punctuation and spacing vary between what was typed and what the
// catalogue holds — "Teknokids Coding: JavaScript" vs "TEKNOKIDS CODING:
// JAVASCRIPT/AI" — so compare on letters and digits alone.
const squash = (s) => norm(s).replace(/[^A-Z0-9]/g, '')
const tokens = (s) => norm(s).split(/[^A-Z0-9]+/).filter(t => t.length > 2)

function suggest(name, catalogue) {
  const a = squash(name)
  const exact = catalogue.filter(c => squash(c) === a)
  if (exact.length === 1) return { pick: exact[0], why: 'same once punctuation is ignored', sure: true }

  const prefix = catalogue.filter(c => squash(c).startsWith(a) || a.startsWith(squash(c)))
  if (prefix.length === 1) return { pick: prefix[0], why: 'one is the start of the other', sure: true }
  if (prefix.length > 1) return { pick: null, why: `${prefix.length} candidates: ${prefix.join(' | ')}`, sure: false }

  const want = tokens(name)
  const scored = catalogue
    .map(c => ({ c, hits: tokens(c).filter(t => want.includes(t)).length }))
    .filter(x => x.hits > 0)
    .sort((x, y) => y.hits - x.hits)
  if (!scored.length) return { pick: null, why: 'nothing similar in the catalogue', sure: false }
  const top = scored.filter(x => x.hits === scored[0].hits)
  if (top.length === 1) return { pick: top[0].c, why: `shares ${top[0].hits} word(s)`, sure: false }
  return { pick: null, why: `${top.length} equally close: ${top.map(x => x.c).join(' | ')}`, sure: false }
}

async function main() {
  console.log(`Authenticating against ${PB_URL} …`)
  await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD)
  console.log('  ✓ authenticated\n')

  const progRows = await pb.collection('programs').getFullList({ batch: 500 })
  const catalogue = [...new Set(progRows.map(r => r.payload?.name).filter(Boolean))]
  const known = new Set(catalogue.map(norm))
  const regRows = await pb.collection('registrations').getFullList({ batch: 500 })

  let total = 0
  const orphans = new Map() // name -> [{row, payload, entry, who}]
  for (const row of regRows) {
    const payload = row.payload || {}
    for (const entry of (payload.programs || [])) {
      if (!entry.program) continue
      total++
      if (known.has(norm(entry.program))) continue
      const k = entry.program
      if (!orphans.has(k)) orphans.set(k, [])
      orphans.get(k).push({ row, payload, entry, who: payload.displayName || row.recordId })
    }
  }

  console.log(`Catalogue      : ${catalogue.length} programs`)
  console.log(`Registrations  : ${regRows.length}`)
  console.log(`Enrolments     : ${total}`)
  console.log(`Naming a program that does not exist: ${[...orphans.values()].reduce((n, l) => n + l.length, 0)}`
    + ` across ${orphans.size} distinct name(s)\n`)

  if (!orphans.size) { console.log('Nothing to repair.'); return }

  if (DELETE) {
    /* Removing the enrolment, not the student. Anyone left with none is
       still on the roll — they are simply booked into nothing, which is
       the truth once a booking against a non-existent class is gone. */
    let removing = 0
    const emptied = []
    const touched = new Map()
    for (const [name, list] of [...orphans.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  ${String(list.length).padStart(2)}x  "${name}"`)
      console.log(`        ${list.map(x => x.who).slice(0, 6).join(', ')}${list.length > 6 ? ' …' : ''}`)
      removing += list.length
      for (const x of list) touched.set(x.row.id, x)
    }
    // What each student is left holding.
    for (const [, x] of touched) {
      const keep = (x.payload.programs || []).filter(e => !e.program || known.has(norm(e.program)))
      if (keep.length === 0) emptied.push(x.who)
    }

    console.log(`\nWould delete ${removing} enrolment(s) from ${touched.size} registration(s).`)
    if (emptied.length) {
      console.log(`${emptied.length} student(s) would be left with no classes at all — they stay on the roll:`)
      console.log('  ' + [...new Set(emptied)].join(', '))
    }

    if (!APPLY) {
      console.log('\nRead-only — nothing was deleted.')
      console.log('Add --apply to back up and delete them.')
      return
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dumpPath = path.join(SERVER_DIR, `backup-registrations-${stamp}.json`)
    fs.writeFileSync(dumpPath, JSON.stringify(regRows, null, 2))
    console.log(`\n  ✓ backup written to ${path.relative(path.join(SERVER_DIR, '..'), dumpPath)}`)

    for (const [id, x] of touched) {
      x.payload.programs = (x.payload.programs || []).filter(e => !e.program || known.has(norm(e.program)))
      await pb.collection('registrations').update(id, { payload: x.payload })
    }
    console.log(`  ✓ deleted ${removing} enrolment(s) across ${touched.size} registration(s)`)
    console.log('\n✓ Done. Restart the API so it drops its cached registrations:')
    console.log('    pm2 restart craniaverse-api')
    return
  }

  const plan = []
  for (const [name, list] of [...orphans.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const forced = MAP.get(norm(name))
    const s = forced ? { pick: forced, why: 'given on the command line', sure: true } : suggest(name, catalogue)
    console.log(`  ${String(list.length).padStart(2)}x  "${name}"`)
    console.log(`        held by: ${list.map(x => x.who).slice(0, 4).join(', ')}${list.length > 4 ? ' …' : ''}`)
    if (s.pick) {
      const ok = forced || s.sure
      console.log(`        ${ok ? '→ would repoint to' : '~ closest match'}: "${s.pick}"  (${s.why})`)
      if (ok) plan.push({ name, to: s.pick, list })
      else console.log('          not applied — too uncertain, pass --map to choose')
    } else {
      console.log(`        ? no confident match — ${s.why}`)
      console.log('          pass --map "' + name + '=EXACT CATALOGUE NAME" to repoint it')
    }
  }

  console.log(`\n${plan.length} name(s) can be repointed confidently.`)
  if (!APPLY) {
    console.log('\nRead-only — nothing was written.')
    console.log('Add --apply to repoint the confident ones (a backup is written first).')
    return
  }
  if (!plan.length) { console.log('Nothing confident enough to apply.'); return }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dumpPath = path.join(SERVER_DIR, `backup-registrations-${stamp}.json`)
  fs.writeFileSync(dumpPath, JSON.stringify(regRows, null, 2))
  console.log(`\n  ✓ backup written to ${path.relative(path.join(SERVER_DIR, '..'), dumpPath)}`)

  const touched = new Map()
  for (const { to, list } of plan) {
    for (const x of list) { x.entry.program = to; touched.set(x.row.id, x) }
  }
  for (const [id, x] of touched) {
    await pb.collection('registrations').update(id, { payload: x.payload })
  }
  console.log(`  ✓ updated ${touched.size} registration(s)`)
  console.log('\n✓ Done. Restart the API so it drops its cached registrations:')
  console.log('    pm2 restart craniaverse-api')
}

main().catch(err => {
  console.error('\n✗ Failed:', err?.response || err?.message || err)
  process.exit(1)
})
