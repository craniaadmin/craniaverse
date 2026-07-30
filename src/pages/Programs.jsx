import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../data/store'
/* The seed file carries the presentation settings the template shipped with — column
   order, category colours and the two real locations. Programs themselves come from
   the store; only these view defaults are read from it. */
import SEED from '../data/programsData.json'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'ngrok-skip-browser-warning': 'true' }

/* ---------- constants lifted from the v47 template ---------- */
const DOW = [{ n: 1, l: 'Mon' }, { n: 2, l: 'Tue' }, { n: 3, l: 'Wed' }, { n: 4, l: 'Thu' },
  { n: 5, l: 'Fri' }, { n: 6, l: 'Sat' }, { n: 0, l: 'Sun' }]
const DOW_ORD = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }
const LPAL = ['#F1F3F4', '#A6E2F9', '#5FA09E', '#E0DE85', '#2E2516', '#FBDDE4', '#FCE6D2',
  '#FBF3CE', '#E8F3C2', '#DEF2DE', '#BEEBE8', '#D8ECF8', '#CAD6F2', '#E7DEF5', '#E2CDA0', '#FFFFFF']
const DEFAULT_CAT_COLOR = '#F1F3F4'
const DEFCAT = ['ENRICHMENT', 'FLEX', 'TEKNOKIDS ROBOTICS', 'TEKNOKIDS CODING', 'PRIVATE LESSONS',
  'PRIVATE PIANO LESSONS', 'CONTESTS', 'SUMMER CAMP', 'CLUBS']
const PLATFORMS = ['In-Person', 'Online', 'In-Person/Online']
const GRADES = ['JK', 'SK', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const PERIODS = ['', '/week', '/month', '/term', '/year']
const COST_UNITS = ['', '/week', '/month', '/term', '/year', '/session', '/class']

const DEFCOLS = ['active', 'number', 'code', 'year', 'name', 'subject', 'category', 'age',
  'location', 'days', 'time', 'platform', 'duration', 'lessons', 'cost', 'rate', 'hours', 'spots', 'instructor']

/* The order the columns actually sit in on screen, as saved in the seed. */
const SEED_COL_ORDER = (() => {
  const saved = Array.isArray(SEED.colOrder) ? SEED.colOrder.filter(k => DEFCOLS.includes(k)) : []
  return saved.concat(DEFCOLS.filter(k => !saved.includes(k)))
})()
const SEED_LOCATIONS = Array.isArray(SEED.locations) && SEED.locations.length
  ? SEED.locations
  : [{ id: 'loc_boardwalk', name: 'Boardwalk', color: '#5FA09E' },
    { id: 'loc_waterloo', name: 'Waterloo East', color: '#A6E2F9' }]
const SEED_CAT_COLORS = (SEED.catColors && typeof SEED.catColors === 'object') ? SEED.catColors : {}
const SEED_SUBJ_COLORS = (SEED.subjColors && typeof SEED.subjColors === 'object') ? SEED.subjColors : {}
const SEED_CAT_ORDER = Array.isArray(SEED.categoryOrder) ? SEED.categoryOrder : DEFCAT
const SEED_HIDDEN_COLS = (SEED.hiddenCols && typeof SEED.hiddenCols === 'object') ? SEED.hiddenCols : {}

const COLS = [
  { k: 'number', l: 'Program ID' }, { k: 'code', l: 'Program Code' }, { k: 'name', l: 'Program', gear: 'prog' },
  { k: 'active', l: 'Active' }, { k: 'subject', l: 'Subject', gear: 'cat' }, { k: 'category', l: 'Category', gear: 'cat' },
  { k: 'year', l: 'Year' }, { k: 'age', l: 'Grade', gear: 'grade' }, { k: 'location', l: 'Location', gear: 'loc' },
  { k: 'platform', l: 'Platform', gear: 'platform' }, { k: 'days', l: 'Days', gear: 'day' },
  { k: 'time', l: 'Time', gear: 'time' }, { k: 'duration', l: 'Duration' }, { k: 'lessons', l: '# Of Lessons' },
  { k: 'cost', l: 'Cost' }, { k: 'rate', l: 'Rate/Hr' }, { k: 'hours', l: 'Total Hrs' },
  { k: 'spots', l: 'Enrolment' }, { k: 'instructor', l: 'Instructor' },
]
const COL = Object.fromEntries(COLS.map(c => [c.k, c]))

/* ---------- managed lists ----------
   Program, Platform, Grade, Time and Day each keep their own colour map and,
   where the order is the user's to choose, their own order array. `fixed`
   lists cannot be renamed, reordered or removed — only recoloured. */
const LIST_KINDS = {
  prog: { title: 'Programs', field: 'name', colours: 'progColors', order: 'progOrder' },
  platform: { title: 'Platforms', field: 'platform', colours: 'platformColors', order: 'platformOrder' },
  grade: { title: 'Grades', field: 'ageRange', colours: 'gradeColors', order: 'gradeOrder', range: true },
  time: { title: 'Times', field: null, colours: 'timeColors', order: 'timeOrder', time: true },
  day: { title: 'Days', field: null, colours: 'dayColors', order: null, fixed: true },
}
const LIST_STATE_KEYS = ['progColors', 'platformColors', 'gradeColors', 'timeColors', 'dayColors']
const LIST_ORDER_KEYS = ['progOrder', 'platformOrder', 'gradeOrder', 'timeOrder']

/* The distinct values a managed list offers, read from the data. */
function listValues(kind, programs, rows) {
  switch (kind) {
    case 'prog': return [...new Set(programs.map(p => p.name).filter(Boolean))]
    case 'platform': return [...new Set(programs.map(p => p.platform).filter(Boolean))]
    case 'grade': return [...new Set(programs.map(p => p.ageRange).filter(Boolean))]
    case 'time': return [...new Set(rows.map(r => r.slot && r.slot.start).filter(Boolean))]
    case 'day': return DOW.map(d => String(d.n))
    default: return []
  }
}
/* Saved order first, then anything new, sorted naturally. */
function listOrdered(kind, programs, rows, orderArr) {
  const K = LIST_KINDS[kind]
  let vals = listValues(kind, programs, rows).map(String)
  if (K.order) {
    (orderArr || []).forEach(v => { if (!vals.includes(v)) vals.push(v) })
    if (K.time) vals = vals.sort()
    const ord = (orderArr || []).filter(v => vals.includes(v))
    vals = ord.concat(vals.filter(v => !ord.includes(v))
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })))
  } else if (K.time) vals = vals.sort()
  return vals
}
function listLabel(kind, v) {
  if (kind === 'grade') return fmtGrade(v)
  if (kind === 'time') return fmtTime(v)
  if (kind === 'day') return (DOW.find(d => String(d.n) === String(v)) || {}).l || v
  return v
}
function listUsage(kind, v, programs, rows) {
  if (kind === 'prog') return rows.filter(r => r.name === v).length
  if (kind === 'day') return rows.filter(r => String(r.day) === String(v)).length
  if (kind === 'time') return rows.filter(r => r.slot && r.slot.start === v).length
  const K = LIST_KINDS[kind]
  return programs.filter(p => (p[K.field] || '') === v).length
}

/* Which table cells carry the colour their managed list assigns, and how to
   read the value to look up. */
const MANAGED_KIND = { name: 'prog', platform: 'platform', age: 'grade', days: 'day', time: 'time' }
const MANAGED_VALUE = {
  name: r => r.name,
  platform: r => r.platform,
  age: r => r.age,
  days: r => (r.day == null ? '' : String(r.day)),
  time: r => (r.slot && r.slot.start) || '',
}

/* Which filter list each column drives. "gen:" keys derive their options from the rows. */
const FK = {
  name: 'prog', subject: 'sub', category: 'cat', year: 'year', age: 'grade', location: 'locf',
  platform: 'platform', days: 'day', time: 'time', cost: 'cost', duration: 'dur',
  active: 'gen:active', number: 'gen:number', code: 'gen:code', lessons: 'gen:lessons',
  rate: 'gen:rate', hours: 'gen:hours', spots: 'gen:spots', instructor: 'gen:instructor',
}
const FK_TITLE = {
  cat: 'Category', prog: 'Program', sub: 'Subject', year: 'Year', grade: 'Grade', locf: 'Location',
  platform: 'Platform', day: 'Day', time: 'Time', cost: 'Cost', dur: 'Duration',
  'gen:active': 'Active', 'gen:number': 'Program ID', 'gen:code': 'Program Code',
  'gen:lessons': '# Of Lessons', 'gen:rate': 'Rate', 'gen:hours': 'Hours',
  'gen:spots': 'Spots', 'gen:instructor': 'Instructor',
}

const REPEATABLE = { category: 1 }
const REPEATABLE_IN_PROGRAM = { number: 1, code: 1, name: 1, days: 1 }
const REPEATABLE_IN_CATEGORY = { subject: 1 }
const REPEATABLE_IN_CAT_SUBJ = { year: 1 }

/* Cells that can be edited in place, and where the value lives. */
const CELL_EDIT = {
  number: { on: 'prog', f: 'number' }, code: { on: 'prog', f: 'code' },
  name: { on: 'prog', f: 'name' }, subject: { on: 'prog', f: 'subject' },
  category: { on: 'prog', f: 'category' }, year: { on: 'prog', f: 'year' },
  age: { on: 'prog', f: 'ageRange' }, platform: { on: 'prog', f: 'platform', list: () => PLATFORMS },
  duration: { on: 'prog', f: 'duration', num: true },
  lessons: { on: 'prog', f: 'sessions' }, cost: { on: 'prog', f: 'cost', num: true },
  instructor: { on: 'off', f: 'instructor' }, location: { on: 'off', f: 'locationId' },
  days: { on: 'day' }, time: { on: 'slot' },
}

/* ---------- formatting ---------- */
function money(n) {
  n = Number(n)
  if (!isFinite(n) || n === 0) return '$0'
  return '$' + n.toLocaleString(undefined, { minimumFractionDigits: (n % 1 ? 2 : 0), maximumFractionDigits: 2 })
}
function isDarkColor(hex) {
  if (!hex) return false
  const h = String(hex).replace('#', '')
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) < 150
}
function fmtTime(t) {
  if (!t) return ''
  let [h, m] = String(t).split(':').map(Number)
  if (isNaN(h)) return t
  const ap = h >= 12 ? 'PM' : 'AM'
  let hh = h % 12
  if (hh === 0) hh = 12
  return hh + ':' + String(m || 0).padStart(2, '0') + ' ' + ap
}
function fmtRange(o) {
  if (!o) return ''
  const a = fmtTime(o.start), b = fmtTime(o.end)
  if (a && b) return a + ' – ' + b
  return a || b || ''
}
function fmtDuration(mins) {
  const n = Number(mins)
  if (!isFinite(n) || n <= 0) return String(mins || '')
  const h = Math.floor(n / 60), m = Math.round(n % 60)
  if (!h) return m + ' min'
  return h + ' h' + (m ? ' ' + m + ' min' : '')
}
function fmtGrade(a) {
  if (!a) return ''
  if (/grade/i.test(a)) return a
  if (/^up to /i.test(a)) return a.replace(/^up to\s*/i, 'Up to Grade ')
  return 'Grades ' + a
}
function gradeRank(g) {
  g = (g == null ? '' : String(g)).trim().toUpperCase()
  if (g === '') return -3
  if (g === 'JK') return -2
  if (g === 'SK') return -1
  if (g === 'K') return 0
  const n = parseInt(g, 10)
  return isNaN(n) ? 98 : n
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

/* ---------- auto-numbering / hours helpers from the v47 template ---------- */
const CODE_MAP = {
  'FLEX MATH - SINGLE': 'FM-S', 'FLEX MATH - DOUBLE': 'FM-D', 'FLEX MATH - UNLIMITED': 'FM-U',
  'FLEX ENGLISH - SINGLE': 'FE-S', 'FLEX ENGLISH - DOUBLE': 'FE-D', 'FLEX ENGLISH - UNLIMITED': 'FE-U',
  'FLEX KINDERGARTEN - SINGLE': 'FK-S', 'FLEX KINDERGARTEN - DOUBLE': 'FK-D',
  'MATH ENRICHMENT - LEVEL 1': 'ME1', 'MATH ENRICHMENT - LEVEL 2': 'ME2',
  'MATH ENRICHMENT - LEVEL 3': 'ME3', 'MATH ENRICHMENT - LEVEL 4': 'ME4',
  'PRIVATE LESSONS - 55 MIN': 'PL-55',
  'TEKNOKIDS CODING: SCRATCH': 'TKC-SCR', 'TEKNOKIDS CODING: HTML/CSS': 'TKC-HTM',
  'TEKNOKIDS CODING: JAVASCRIPT/AI': 'TKC-JS', 'TEKNOKIDS CODING: PYTHON': 'TKC-PY',
  'TEKNOKIDS EARLY': 'TKR-E', 'TEKNOKIDS JUNIOR': 'TKR-J',
  'TEKNOKIDS INTERMEDIATE': 'TKR-I', 'TEKNOKIDS SENIOR': 'TKR-S',
  'PIANO PRIVATE 30MIN - SR': 'PNO-SR', 'PIANO PRIVATE 30MIN - JR': 'PNO-JR',
  'CONTEST - CMS CLMC': 'CLMC', 'CONTEST - CMS CJMC': 'CJMC', 'CONTEST - CMS COMC': 'COMC',
  'CONTEST - MAA AMC 8': 'AMC8', 'CONTEST - MAA AMC 10A': 'AMC10A', 'CONTEST - MAA AMC 12A': 'AMC12A',
  'CONTEST - MAA AMC 10B': 'AMC10B', 'CONTEST - MAA AMC 12B': 'AMC12B',
  'CONTEST - MAA AIME': 'AIME', 'CONTEST - MAA US(J)MO': 'USJMO',
  'CONTEST - CEMC BCC': 'BCC', 'CONTEST - CEMC GAUSS': 'GAU', 'CONTEST - CEMC PASCAL': 'PAS',
  'CONTEST - CEMC CAYLEY': 'CAY', 'CONTEST - CEMC FERMAT': 'FER', 'CONTEST - CEMC FRYER': 'FRY',
  'CONTEST - CEMC GALOIS': 'GAL', 'CONTEST - CEMC HYPATIA': 'HYP', 'CONTEST - CEMC CIMC': 'CIMC',
  'FLEX MATH - HALF DAY': 'CMP-MTH-H', 'FLEX MATH - FULL DAY': 'CMP-MTH-F',
  'FLEX TYPING - HALF DAY': 'CMP-TYP-H', 'FLEX TYPING - FULL DAY': 'CMP-TYP-F',
  'FLEX HANDWRITING - HALF DAY': 'CMP-HWR-H', 'FLEX HANDWRITING - FULL DAY': 'CMP-HWR-F',
  'FLEX SPELLING - HALF DAY': 'CMP-SPL-H', 'FLEX SPELLING - FULL DAY': 'CMP-SPL-F',
  'SCIENCEKIDS BRAIN - FULL DAY': 'CMP-SCI-F',
  'TEKNOKIDS ROBOTICS - HALF DAY': 'CMP-ROB-H', 'TEKNOKIDS ROBOTICS - FULL DAY': 'CMP-ROB-F',
  'ARTSKIDS SEWING - FULL DAY': 'CMP-ART-F', 'ARTSKIDS SEWING - HALF DAY': 'CMP-ART-H',
}

function computeTotalHours(duration, sessions, period) {
  const dur = Number(duration)
  let n = Number(sessions)
  if (!isFinite(dur) || dur <= 0) return ''
  if (!isFinite(n) || n <= 0) n = 1
  const weeks = period === '/week' ? 35 : 1
  return Math.round(dur * n * weeks / 60 * 100) / 100
}

function locDigit(id, locations) {
  const l = locations.find(x => x.id === id)
  if (!l) return '0'
  if (l.id === 'loc_boardwalk' || /board|^bw$/i.test(l.name || '')) return '1'
  if (l.id === 'loc_waterloo' || /waterloo|^we$/i.test(l.name || '')) return '2'
  return '0'
}

function genProgramIds(programs, categoryOrder, subjOrder, locations) {
  const SUBJ = ['MATH', 'ENGLISH', 'ROBOTICS', 'CODING', 'PIANO', 'ARTS', 'SCIENCE', 'MATH/ENGLISH', 'ALL']
  const pad2 = n => String(n).padStart(2, '0')
  const subjNum = x => {
    x = (x || '').trim().toUpperCase()
    let i = SUBJ.indexOf(x)
    if (i < 0) { i = SUBJ.length; SUBJ.push(x) }
    return pad2(i + 1)
  }
  const seq = {}
  const next = programs.map(p => {
    const loc = (p.offerings && p.offerings[0]) ? locDigit(p.offerings[0].locationId, locations) : '0'
    const ci = categoryOrder.indexOf(p.category)
    const cat = pad2(ci < 0 ? 0 : ci + 1)
    const sub = subjNum(p.subject)
    const key = (p.category || '') + '|' + (p.subject || '')
    seq[key] = (seq[key] || 0) + 1
    const sp = pad2(seq[key])
    return { ...p, number: loc + cat + sub + sp }
  })
  return next
}

function autoCode(name) {
  const n = (name || '').trim().toUpperCase()
  return CODE_MAP[n] || ''
}

/* ---------- row model ---------- */
function offTimes(o) {
  if (o && Array.isArray(o.times) && o.times.length) return o.times
  return (o && (o.start || o.end)) ? [{ start: o.start || '', end: o.end || '' }] : []
}
function rateOf(p) {
  if (p.rate != null && p.rate !== '') return Number(p.rate)
  const m = /\$([\d.]+)\s*\/\s*hr/i.exec(p.description || '')
  return m ? Number(m[1]) : null
}
function hoursOf(p) { return (p.totalHours != null && p.totalHours !== '') ? Number(p.totalHours) : null }

function buildRows(programs, locIndex) {
  const out = []
  for (const p of programs) {
    const prate = rateOf(p), phrs = hoursOf(p)
    const offs = (p.offerings && p.offerings.length) ? p.offerings : [null]
    for (const of_ of offs) {
      const dayList = (of_ && (of_.days || []).length)
        ? of_.days.slice().sort((a, b) => DOW_ORD[a] - DOW_ORD[b]) : [null]
      const tl = of_ ? offTimes(of_) : []
      const timeList = tl.length ? tl : [null]
      for (const dayN of dayList) {
        for (let ti = 0; ti < timeList.length; ti++) {
          const tm = timeList[ti]
          out.push({
            progId: p.id, offId: of_ ? of_.id : null,
            day: dayN, slot: tm || null, slotIndex: tm ? ti : null,
            number: p.number || '', code: p.code || '', name: p.name || '',
            active: (p.active !== false), subject: p.subject || '', category: p.category || '',
            year: p.year || '', platform: p.platform || '', age: p.ageRange || '',
            gradeFrom: p.gradeFrom || '', gradeTo: p.gradeTo || '', desc: p.description || '',
            rate: prate, hours: phrs,
            duration: (p.duration != null ? p.duration : ''),
            sessions: (p.sessions || ''), period: (p.period || ''),
            locId: of_ ? of_.locationId : '',
            locName: of_ ? ((locIndex[of_.locationId] || {}).name || '') : '',
            days: of_ ? (of_.days || []) : [],
            cost: (p.cost != null && p.cost !== '' ? Number(p.cost) : null),
            costUnit: p.costUnit || '',
            capacity: of_ ? of_.capacity : null, enrolled: of_ ? of_.enrolled : null,
            instructor: of_ ? (of_.instructor || '') : '',
          })
        }
      }
    }
  }
  return out
}
function famKey(r) { return String(r.number || r.name || r.progId) }
function rowKey(r) {
  return r.progId + '||' + (r.offId || '') + '||' + (r.day == null ? '' : r.day) + '||' + (r.slotIndex == null ? '' : r.slotIndex)
}
function colValue(r, key) {
  switch (key) {
    case 'active': return r.active ? 'Active' : 'Inactive'
    case 'number': return r.number || ''
    case 'code': return r.code || ''
    case 'lessons': return r.sessions ? String(r.sessions) + (r.period || '') : ''
    case 'rate': return r.rate == null ? '' : String(r.rate)
    case 'hours': return r.hours == null ? '' : String(r.hours)
    case 'instructor': return r.instructor || ''
    case 'spots': {
      const c = Number(r.capacity), e = Number(r.enrolled)
      if (!isFinite(c) || c <= 0) return ''
      const left = c - (isFinite(e) ? e : 0)
      return left <= 0 ? 'Full' : left + ' left'
    }
    default: return ''
  }
}
function colLabel(r, key) {
  const v = colValue(r, key)
  if (key === 'rate' && v !== '') return money(Number(v)) + '/hr'
  if (key === 'hours' && v !== '') return v + ' h'
  return v
}

const CSS = `
.pg{--light-blue:#A6E2F9;--teal:#5FA09E;--pill:#F1F3F4;--yellow:#E0DE85;--dark-brown:#2E2516;
    --line:#E7EBE7;--field:#D5D0C4;--muted:#6B6455;--faint:#9A948A;--danger:#C0392B;
    --shadow:0 1px 3px rgba(46,37,22,.15);color:var(--dark-brown)}
.pg .actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0 14px}
.pg .actions button{background:#fff;border:1px solid #e2ded2;color:var(--dark-brown);padding:6px 12px;
    font-size:12.5px;font-weight:700;border-radius:8px;cursor:pointer;font-family:inherit}
.pg .actions button:hover:not(:disabled){background:#f4f2ea}
.pg .actions button:disabled{opacity:.4;cursor:default}

.pg .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px}
.pg .metric{background:#fff;border-radius:12px;padding:14px 16px;box-shadow:var(--shadow);
    border-bottom:3px solid var(--teal);cursor:default}
.pg .metric.clickable{cursor:pointer}
.pg .metric.clickable:hover{outline:2px solid var(--light-blue);outline-offset:1px}
.pg .metric.mact{border-bottom-color:var(--yellow)}
.pg .metric.mspots{border-bottom-color:#c0392b}
.pg .metric.mhours{border-bottom-color:var(--light-blue)}
.pg .metric .label{font-size:12.5px;color:#6b6455;font-weight:600;margin-bottom:4px}
.pg .metric .value{font-size:24px;font-weight:700;color:var(--dark-brown);font-variant-numeric:tabular-nums}
.pg .metric .hint{font-size:11.5px;color:#9a948a;margin-top:3px}

.pg .filters{display:flex;align-items:center;gap:8px;padding:8px 0 14px;flex-wrap:wrap}
.pg .filters input[type=search],.pg .filters select{padding:7px 12px;border:1px solid var(--field);
    border-radius:8px;font-size:13px;color:var(--dark-brown);background:#fff;font-family:inherit}
.pg .filters input[type=search]:focus,.pg .filters select:focus{outline:none;border-color:var(--teal)}
.pg .filters input[type=search]{width:220px}
.pg .filters input[type=search]::placeholder{color:var(--faint)}
.pg .filters .addbtn{border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:600;
    background:var(--light-blue);color:var(--dark-brown);cursor:pointer;font-family:inherit;margin-left:auto}
.pg .filters .addbtn:hover{filter:brightness(1.08)}

.pg .bulkbar{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#eef7f6;
    border:1px solid var(--line);border-radius:10px;margin-bottom:12px}
.pg .bulkbar .n{font-weight:700;font-size:13px;margin-right:14px}
.pg .bulkbar button{border:none;border-radius:8px;padding:7px 13px;font-size:12.5px;font-weight:600;
    cursor:pointer;font-family:inherit}
.pg .bulkbar .edit{background:var(--teal);color:#fff}
.pg .bulkbar .del{background:#c0392b;color:#fff}
.pg .bulkbar .clr{background:transparent;border:1px solid var(--field);color:var(--muted)}
.pg .bulkbar .acts{display:inline-flex;align-items:center;gap:8px}

.pg .card{background:#fff;border-radius:12px 12px 0 0;box-shadow:var(--shadow);
    border-left:3px solid var(--light-blue);border-right:3px solid var(--yellow);
    border-bottom:3px solid var(--teal);overflow-x:auto}
.pg table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:5px 5px;background:#fff}
.pg thead th{background:var(--teal);color:#fff;text-align:center;font-size:10.5px;font-weight:700;
    text-transform:uppercase;letter-spacing:.3px;padding:6px 4px;height:26px;white-space:nowrap;
    user-select:none;border-radius:6px;position:relative}
.pg thead th.colh .lbl{display:block;text-align:center;padding:0 30px}
.pg thead th.colh.hasgear .lbl{padding:0 42px}
.pg thead th.colh .thicons{position:absolute;right:3px;top:50%;transform:translateY(-50%);
    display:inline-flex;align-items:center;gap:2px;line-height:1}
.pg thead th.selcol,.pg thead th.blankhead,.pg tbody td.selcol,.pg tbody td.actcell{background:transparent}
.pg thead th.selcol input,.pg tbody td.selcol input{width:12px;height:12px;margin:0;
    accent-color:var(--teal);vertical-align:middle;cursor:pointer}
.pg tbody td.actcell{white-space:nowrap;text-align:center}
.pg td.actcell,.pg th.blankhead{width:59px;min-width:59px;max-width:59px}
.pg th.filler,.pg td.filler{width:100%;padding:0;background:transparent !important;border:none}
.pg tbody td.col-active{text-align:center}
.pg td[data-ek]{cursor:pointer}
.pg td[data-ek]:hover{box-shadow:inset 0 0 0 1px #cfd6d8}
.pg td.editing{padding:0 2px;box-shadow:none}
.pg .cellin{width:100%;min-width:40px;box-sizing:border-box;border:none;border-radius:4px;background:#fff;
    font:inherit;font-size:12px;line-height:1.35;height:21px;padding:0 4px;color:var(--dark-brown);
    box-shadow:inset 0 0 0 1px var(--teal);outline:none;display:block}
.pg tr.frow th{background:#eaf3f2;padding:6px 8px;border-top:1px solid var(--line);border-radius:0}
.pg .colf{width:100%;background:#fff;border:1px solid var(--field);border-radius:7px;padding:5px 8px;
    font-size:12px;color:var(--dark-brown);font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit}
.pg .colf.on{background:var(--light-blue);border-color:var(--light-blue)}
.pg .colf:hover{border-color:var(--teal)}
.pg thead th .arw{opacity:.85;font-size:10px}
.pg thead th .gear{cursor:pointer;opacity:.85;font-size:11px}
.pg thead th .gear:hover{opacity:1}
.pg thead th.colh{cursor:grab}
.pg thead th.colh.dropt{outline:2px dashed var(--light-blue);outline-offset:-2px}
.pg thead th.colh .eye{cursor:pointer;opacity:0;font-size:11px;transition:opacity .12s}
.pg thead th.colh:hover .eye{opacity:1}
.pg thead th .sortable{cursor:pointer}
.pg tbody td{padding:0 7px;background:var(--pill);border-radius:5px;font-size:12px;font-weight:400;
    vertical-align:middle;white-space:nowrap;line-height:1.35;height:22px;overflow:hidden;text-overflow:ellipsis}
.pg tbody td.rep{background:transparent !important}
.pg tbody tr.progsep td{background:transparent;height:1px;padding:0;border-radius:0;border-top:1px solid #CFD6D8}
.pg tbody tr.progsep td.nosep{border-top:none}
.pg tbody tr:hover td{background:#E4EFF3}
.pg tbody tr.sel td{background:#DCEEEC}
.pg tbody tr.rinactive td:not(.col-year):not(.col-category):not(.col-subject):not(.col-number):not(.col-code):not(.col-name):not(.col-active){color:#b0a99e}
.pg tbody tr.rinactive td.tint:not(.col-category):not(.col-subject):not(.col-active){background:var(--pill) !important;color:#b0a99e !important}
.pg tbody tr.rinactive td.col-active.tint{background:#FADBD8 !important;color:#922B21 !important}
.pg tbody tr.rinactive .loc .dot{background:#c9c3b5 !important}
.pg tbody tr.rinactive .spots,.pg tbody tr.rinactive .hint{color:#b0a99e !important}
.pg tbody tr.rdead td{color:#b0a99e}
.pg tbody tr.rdead td.tint{background:var(--pill) !important;color:#b0a99e !important}
.pg tbody tr.rdead td.col-active.tint{background:#FADBD8 !important;color:#922B21 !important}
.pg tbody tr.rdead .loc .dot{background:#c9c3b5 !important}
.pg tbody tr.rdead .catpill,.pg tbody tr.rdead .mono,.pg tbody tr.rdead .spots,
.pg tbody tr.rdead .hint,.pg tbody tr.rdead .prog-name{color:#b0a99e !important}
.pg .selcol{width:34px;text-align:center}
.pg .prog-name{font-weight:400}
.pg .mono{font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:var(--muted)}
.pg .catpill{display:inline;font-size:12px;font-weight:400;color:inherit}
.pg td.tint{background:var(--tint) !important}
.pg tbody tr:hover td.tint{filter:brightness(.96)}
.pg .loc{display:inline-flex;align-items:center;gap:5px;border:none;padding:0;font-weight:400;
    font-size:12px;white-space:nowrap}
.pg .loc .dot{width:7px;height:7px;border-radius:50%;flex:none}
.pg .cost{font-weight:700;white-space:nowrap}
.pg .spots{font-size:12px;font-weight:400;border-radius:0;padding:0;background:none;white-space:nowrap}
.pg .spots.ok{color:#1f7a3d}
.pg .spots.full{color:#922B21}
.pg .spots.none{color:var(--muted)}
.pg .spots.cnt{color:#5a6b6f}
.pg .enr{display:inline-flex;flex-direction:row;gap:5px;align-items:center}
.pg .actbtn{border:none;background:none;padding:0;font-size:12px;font-weight:400;cursor:pointer;line-height:inherit;font-family:inherit}
.pg .empty{text-align:center;color:var(--muted);padding:60px 20px}
.pg .empty b{color:var(--dark-brown)}
.pg .hint{color:var(--faint);font-size:12px}
.pg thead th.colh[data-col="active"],.pg thead th.colh[data-col="year"]{white-space:nowrap}
.pg thead th.colh[data-col="active"] .lbl,.pg thead th.colh[data-col="year"] .lbl{padding:0 13px}
.pg thead th.colh[data-col="active"] .thicons,.pg thead th.colh[data-col="year"] .thicons{top:8px;transform:none}
.pg td.col-active,.pg td.col-year{max-width:74px}
.pg thead th.colh[data-col="number"],.pg thead th.colh[data-col="code"]{white-space:nowrap}
.pg thead th.colh[data-col="number"] .lbl,.pg thead th.colh[data-col="code"] .lbl,
.pg thead th.colh[data-col="lessons"] .lbl{padding:0 13px}
.pg thead th.colh[data-col="number"] .thicons,.pg thead th.colh[data-col="code"] .thicons,
.pg thead th.colh[data-col="lessons"] .thicons{top:8px;transform:none}
.pg td.col-number,.pg td.col-code{max-width:104px;white-space:nowrap}
.pg td.col-name{white-space:nowrap;max-width:260px}
.pg thead th.colh[data-col="lessons"]{white-space:nowrap}
.pg td.col-lessons{max-width:86px;white-space:nowrap}
.pg td.col-hours{white-space:nowrap}
.pg .rowbtn{background:none;border:none;color:#c9c3b5;padding:0;margin:0;font-size:12px;font-weight:400;
    line-height:1;width:15px;height:15px;border-radius:4px;cursor:pointer;transition:color .15s}
.pg .rowbtn.rb-dup{font-size:13px}
.pg .rowbtn.rb-pen:hover,.pg .rowbtn.rb-dup:hover{color:var(--teal)}
.pg .rowbtn.rb-del:hover{color:#c0392b}
.pg .tcount{color:var(--muted);font-size:12px;padding:10px 2px;text-align:right}

.pgpop{position:fixed;z-index:220;background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:8px 12px 10px;min-width:190px;max-height:360px;
    overflow:auto;color:#2E2516;font-family:inherit}
.pgpop .h{font-size:12px;color:#6B6455;font-weight:700;margin:2px 2px 7px}
.pgpop .ch{display:flex;align-items:center;gap:9px;padding:5px 3px;font-size:13px;font-weight:600;cursor:pointer}
.pgpop .ch:hover{background:#f4f2ea;border-radius:6px}
.pgpop .ch input{margin:0;accent-color:#5FA09E}
.pgpop .selbar{display:flex;gap:12px;margin:0 3px 7px;font-size:12px;font-weight:700}
.pgpop .selbar span{cursor:pointer}
.pgpop .selbar .sa{color:#5FA09E}
.pgpop .selbar .cl{color:#6B6455}
.pgpop .allrow{border-top:1px solid #EDEAE2;margin-top:4px;padding-top:4px;display:flex;gap:4px;
    position:sticky;bottom:0;background:#fff}
.pgpop .allrow button{background:none;border:none;color:#5FA09E;font-weight:700;font-size:12.5px;
    text-align:center;padding:6px 8px;border-radius:6px;flex:1;cursor:pointer;font-family:inherit}
.pgpop .allrow button:hover{background:#f4f2ea}

.pgov{position:fixed;inset:0;background:rgba(46,37,22,.45);display:flex;align-items:flex-start;
    justify-content:center;z-index:200;overflow:auto;padding:40px 16px}
.pgmodal{background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.3);width:100%;
    max-width:460px;margin:auto;padding:22px;color:#2E2516;font-family:inherit}
.pgmodal.sm{max-width:420px}
.pgmodal h2{font-size:18px;margin:0 0 16px;color:#2E2516}
.pgmodal .field{margin-bottom:14px;min-width:0}
.pgmodal .frow{display:flex;gap:12px}
.pgmodal .frow .field{flex:1}
.pgmodal .field label{display:block;font-size:12.5px;font-weight:600;margin-bottom:5px;color:#6b6455}
.pgmodal .field input,.pgmodal .field select,.pgmodal .field textarea{width:100%;padding:9px 11px;
    border:1px solid #d5d0c4;border-radius:8px;font:inherit;font-size:14px;background:#fff;color:#2E2516}
.pgmodal .field textarea{resize:vertical;min-height:62px}
.pgmodal .field input:focus,.pgmodal .field select:focus,.pgmodal .field textarea:focus{
    outline:none;border-color:#5FA09E}
.pgmodal .field label.bchk{display:flex;align-items:center;gap:7px;margin-bottom:0;cursor:pointer}
.pgmodal .field label.bchk input{width:15px;height:15px;flex:none;padding:0;accent-color:#5FA09E}
.pgmodal .macts{display:flex;gap:10px;justify-content:flex-end;margin-top:6px}
.pgmodal .macts button{font:inherit;cursor:pointer;border:none;border-radius:8px;padding:8px 14px;
    background:#5FA09E;color:#fff;font-weight:600}
.pgmodal .macts button:hover{filter:brightness(1.06)}
.pgmodal .macts button.cancel{background:#eee;color:#2E2516}
.pgmodal .macts .btn-del{background:#fff;color:#c0392b;border:1px solid #eecfca;margin-right:auto}
.pgmodal .days{display:flex;gap:6px;flex-wrap:wrap}
.pgmodal .daybox{display:inline-flex;align-items:center;gap:5px;border:1px solid #D5D0C4;border-radius:8px;
    padding:6px 11px;font-size:12.5px;font-weight:600;cursor:pointer;user-select:none;background:#fff;font-family:inherit}
.pgmodal .daybox.on{background:#5FA09E;color:#fff;border-color:#5FA09E}
.pgmodal .offtabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.pgmodal .offtab{background:#eef3f6;border:1px solid #D5D0C4;border-radius:8px;padding:8px 14px;
    font-size:12.5px;font-weight:600;color:#5a6b6f;cursor:pointer;font-family:inherit}
.pgmodal .offtab.on{background:#A6E2F9;color:#2E2516;border-color:#A6E2F9}
.pgmodal .offtab.add{background:transparent;border:1px dashed #5FA09E;color:#5FA09E}
.pgmodal .off{border:1px solid #BEE6F7;border-left:4px solid #A6E2F9;border-radius:12px;padding:16px;
    margin-bottom:14px;background:#EDF8FD}
.pgmodal .off-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.pgmodal .off-t{font-size:13px;font-weight:700}
.pgmodal .rmoff{background:transparent;border:none;color:#C0392B;font-size:12.5px;font-weight:600;
    padding:2px 4px;cursor:pointer;font-family:inherit}
.pgmodal .trow{display:flex;align-items:center;gap:8px;margin-bottom:7px}
.pgmodal .trow input{flex:1}
.pgmodal .rmtime{background:transparent;border:none;color:#C9C3B5;font-size:16px;font-weight:700;
    cursor:pointer;line-height:1}
.pgmodal .rmtime:hover{color:#C0392B}
.pgmodal .addtime{background:transparent;border:1px dashed #5FA09E;color:#5FA09E;border-radius:8px;
    padding:6px 11px;font-size:12.5px;font-weight:600;margin-top:2px;cursor:pointer;font-family:inherit}
.pgmodal .sec-h{font-size:13px;font-weight:700;color:#5FA09E;margin:20px 0 10px;padding-bottom:7px;
    border-bottom:1px solid #E7EBE7}
.pgmodal .sblock{padding:14px 16px;border-radius:10px;margin-bottom:2px}
.pgmodal .sblock:nth-child(even){background:#E7EAEC}
.pgmodal .sblock .slab{font-weight:700;font-size:13.5px;margin-bottom:4px}
.pgmodal .sblock .sdesc{font-size:12.5px;color:#6B6455;margin-bottom:9px}
.pgmodal .sblock button{border:none;border-radius:8px;padding:6px 12px;font-size:13px;font-weight:600;
    cursor:pointer;font-family:inherit;background:#5FA09E;color:#fff}
.pgmodal .sblock button:disabled{opacity:.5;cursor:default}
.pgmodal .sblock .brow{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;
    font-size:12px;margin-bottom:2px;background:#fff}
.pgmodal .sblock .brow span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6b6455}

/* manager boxes: categories, locations and the managed lists */
.pgmodal .mhint{font-size:12px;color:#6b6455;margin-bottom:14px;line-height:1.4}
.pgmodal .mlist{max-height:60vh;overflow:auto;margin-bottom:8px}
.pgmodal .catrow{display:flex;align-items:center;gap:10px;padding:10px 4px;
    border-bottom:1px solid #f2efe6;background:none;border-radius:0;cursor:default}
.pgmodal .catrow.dropt{outline:2px dashed #5FA09E;outline-offset:-2px}
.pgmodal .catrow.subrow{padding-left:34px}
.pgmodal .catrow .grip{cursor:grab;color:#9a948a;font-size:14px;flex:none}
.pgmodal .catrow .cdot{border-radius:50%;flex:none;border:2px solid #fff;
    box-shadow:0 0 0 1px #d8d3c6;cursor:pointer;padding:0}
.pgmodal .catrow input.cnm{flex:1;padding:2px 4px;border:1px solid transparent;border-radius:6px;
    font-size:13.5px;font-weight:600;color:#2E2516;min-width:0;background:none;font-family:inherit}
.pgmodal .catrow input.cnm:hover{border-color:#e2ded2}
.pgmodal .catrow input.cnm:focus{outline:none;border-color:#5FA09E;background:#fff}
.pgmodal .catrow span.cnm{flex:1;font-size:13.5px;font-weight:600;color:#2E2516;min-width:0}
.pgmodal .catrow.subrow input.cnm,.pgmodal .catrow.subrow span.cnm{font-weight:400;color:#6b6455}
.pgmodal .catrow input.gfrom,.pgmodal .catrow input.gto{flex:0 1 82px;text-align:center}
.pgmodal .catrow .gdash{color:#9a948a;font-size:13px;flex:none}
.pgmodal .catrow .cuse{font-size:11px;color:#6B6455;font-weight:600;min-width:18px;text-align:center;flex:none}
.pgmodal .catrow .mv{background:none;border:none;color:#9a948a;padding:0 6px;font-size:15px;
    width:auto;height:auto;font-weight:400;cursor:pointer;font-family:inherit;flex:none}
.pgmodal .catrow .mv:hover:not(:disabled){color:#5FA09E}
.pgmodal .catrow .mv:disabled{opacity:.3;cursor:default}
.pgmodal .catrow .del2{background:transparent;border:none;color:#C9C3B5;font-size:17px;font-weight:400;
    line-height:1;padding:0 6px;cursor:pointer;font-family:inherit;flex:none}
.pgmodal .catrow .del2:hover:not(:disabled){color:#C0392B}
.pgmodal .catrow .del2:disabled{opacity:.3;cursor:default}
.cpop{position:fixed;z-index:301;background:#fff;border:1px solid #E7EBE7;border-radius:12px;
    box-shadow:0 8px 24px rgba(46,37,22,.22);padding:10px;display:flex;gap:7px;flex-wrap:wrap;width:172px}
.cpop .sw{width:20px;height:20px;border-radius:50%;cursor:pointer;border:2px solid #fff;
    box-shadow:0 0 0 1px #d8d3c6}
`

/* ================= in-app dialogs =================
   The template never uses the browser's own confirm/prompt/alert, so neither
   do we — every question is asked in a styled overlay instead. */
const DialogContext = React.createContext(null)
function useDialog() {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used inside <DialogHost>')
  return ctx
}

function DialogHost({ children }) {
  const [dlg, setDlg] = useState(null)
  const resolver = useRef(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  const finish = useCallback((value) => {
    setDlg(null)
    const r = resolver.current
    resolver.current = null
    if (r) r(value)
  }, [])

  const api = useMemo(() => ({
    confirm: (message, opts = {}) => new Promise(res => {
      resolver.current = res
      setDlg({ type: 'confirm', message, title: opts.title || 'Delete', button: opts.button || 'Delete', danger: opts.danger !== false })
    }),
    prompt: (title, label, value = '') => new Promise(res => {
      resolver.current = res
      setDraft(value)
      setDlg({ type: 'prompt', title, label: label || 'Name' })
    }),
    alert: (title, message) => new Promise(res => {
      resolver.current = res
      setDlg({ type: 'alert', title, message })
    }),
  }), [])

  useEffect(() => {
    if (dlg?.type === 'prompt') {
      const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 30)
      return () => clearTimeout(t)
    }
  }, [dlg])

  useEffect(() => {
    if (!dlg) return
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(dlg.type === 'confirm' ? false : null) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [dlg, finish])

  const cancelValue = dlg?.type === 'confirm' ? false : null

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dlg && (
        <div className="pgov" style={{ zIndex: 400, alignItems: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) finish(cancelValue) }}>
          <div className="pgmodal sm" onClick={e => e.stopPropagation()}>
            <h2>{dlg.title || 'Notice'}</h2>
            {dlg.type === 'prompt' ? (
              <div className="field">
                <label>{dlg.label}</label>
                <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') { e.preventDefault(); finish(draft.trim() || null) }
                  }} />
              </div>
            ) : (
              <p style={{ fontSize: 14, margin: '6px 0 10px', lineHeight: 1.45 }}>{dlg.message}</p>
            )}
            <div className="macts">
              {dlg.type !== 'alert' && (
                <button className="cancel" onClick={() => finish(cancelValue)}>Cancel</button>
              )}
              <button
                style={dlg.type === 'confirm' && dlg.danger ? { background: '#C0392B' } : undefined}
                onClick={() => finish(dlg.type === 'confirm' ? true : dlg.type === 'prompt' ? (draft.trim() || null) : undefined)}>
                {dlg.type === 'confirm' ? dlg.button : dlg.type === 'prompt' ? 'Save' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  )
}

export default function Programs() {
  return <DialogHost><ProgramsPage /></DialogHost>
}

function ProgramsPage() {
  const dialog = useDialog()
  const { staff, programs, setPrograms, programsState, setProgramsState, records: registrations } = useStore()

  /* ---------- persisted view state ---------- */
  const defaultViewState = useMemo(() => {
    const base = {
      locations: SEED_LOCATIONS.map(l => ({ ...l })),
      colOrder: SEED_COL_ORDER.slice(),
      hiddenCols: { ...SEED_HIDDEN_COLS },
      categoryOrder: SEED_CAT_ORDER.slice(),
      subjOrder: {},
      catColors: { ...SEED_CAT_COLORS },
      subjColors: { ...SEED_SUBJ_COLORS },
    }
    /* Managed-list colours and orders, seeded from the template file where it has them. */
    LIST_STATE_KEYS.forEach(k => {
      base[k] = (SEED[k] && typeof SEED[k] === 'object' && !Array.isArray(SEED[k])) ? { ...SEED[k] } : {}
    })
    LIST_ORDER_KEYS.forEach(k => { base[k] = Array.isArray(SEED[k]) ? SEED[k].slice() : [] })
    /* The seven days always exist, so give them a colour entry up front. */
    DOW.forEach(d => { if (!base.dayColors[String(d.n)]) base.dayColors[String(d.n)] = DEFAULT_CAT_COLOR })
    return base
  }, [])

  const [viewState, setViewState] = useState(defaultViewState)
  const loadedViewRef = useRef(null)

  // Load from store once available. `undefined` means the initial load has not
  // returned yet; wait so we don't overwrite existing server state with defaults.
  useEffect(() => {
    if (programsState === undefined) return
    const raw = programsState || {}
    const merged = {
      ...defaultViewState,
      locations: Array.isArray(raw.locations) ? raw.locations : defaultViewState.locations,
      colOrder: Array.isArray(raw.colOrder) ? raw.colOrder : defaultViewState.colOrder,
      hiddenCols: raw.hiddenCols && typeof raw.hiddenCols === 'object' ? raw.hiddenCols : defaultViewState.hiddenCols,
      categoryOrder: Array.isArray(raw.categoryOrder) ? raw.categoryOrder : defaultViewState.categoryOrder,
      subjOrder: raw.subjOrder && typeof raw.subjOrder === 'object' && !Array.isArray(raw.subjOrder) ? raw.subjOrder : defaultViewState.subjOrder,
      catColors: raw.catColors && typeof raw.catColors === 'object' ? raw.catColors : defaultViewState.catColors,
      subjColors: raw.subjColors && typeof raw.subjColors === 'object' ? raw.subjColors : defaultViewState.subjColors,
    }
    LIST_STATE_KEYS.forEach(k => {
      merged[k] = (raw[k] && typeof raw[k] === 'object' && !Array.isArray(raw[k])) ? raw[k] : defaultViewState[k]
    })
    LIST_ORDER_KEYS.forEach(k => {
      merged[k] = Array.isArray(raw[k]) ? raw[k] : defaultViewState[k]
    })
    /* Days are fixed, so their colour map must always be complete. */
    merged.dayColors = { ...merged.dayColors }
    DOW.forEach(d => { if (!merged.dayColors[String(d.n)]) merged.dayColors[String(d.n)] = DEFAULT_CAT_COLOR })
    const s = JSON.stringify(merged)
    if (loadedViewRef.current !== s) {
      loadedViewRef.current = s
      setViewState(prev => {
        const ps = JSON.stringify(prev)
        return ps === s ? prev : merged
      })
    }
  }, [programsState, defaultViewState])

  // Save local changes back to store (debounced inside setProgramsState).
  // Only save after the initial load has completed.
  useEffect(() => {
    if (programsState === undefined) return
    const s = JSON.stringify(viewState)
    if (loadedViewRef.current !== s) {
      loadedViewRef.current = s
      setProgramsState(viewState)
    }
  }, [viewState, setProgramsState, programsState])

  const updateView = useCallback((key, updater) => {
    setViewState(vs => {
      const next = typeof updater === 'function' ? updater(vs[key]) : updater
      return { ...vs, [key]: next }
    })
  }, [])

  /* ---------- local UI state ---------- */
  const [search, setSearch] = useState('')
  const [enrolFilter, setEnrolFilter] = useState('')
  const [filters, setFilters] = useState({
    prog: [], sub: [], cat: [], year: [], grade: [], locf: [], platform: [],
    day: [], time: [], cost: [], dur: [], gen: {},
  })
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const [selected, setSelected] = useState(() => new Set())
  const [pop, setPop] = useState(null)        // {kind:'filter'|'cols', fk?, rect}
  const [editing, setEditing] = useState(null) // program modal
  const [bulkOpen, setBulkOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [managing, setManaging] = useState(null) // 'locations' | 'categories' | 'subjects'
  const [cellEdit, setCellEdit] = useState(null) // {row, col}
  const [history, setHistory] = useState({ undo: [], redo: [] })
  const dragCol = useRef(null)
  const popRef = useRef(null)

  const teacherOptions = useMemo(
    () => staff.map(s => `${s.firstName} ${s.lastName}`.trim()).filter(Boolean).sort(),
    [staff])

  const colOrder = viewState.colOrder
  const hiddenCols = viewState.hiddenCols
  const setColOrder = useCallback(u => updateView('colOrder', u), [updateView])
  const setHiddenCols = useCallback(u => updateView('hiddenCols', u), [updateView])

  /* ---------- locations (persisted sites, plus anything the data introduces) ---------- */
  const locations = useMemo(() => {
    const base = viewState.locations.map(l => ({ ...l }))
    const seen = new Set(base.map(l => l.id))
    let i = base.length
    for (const p of programs) {
      for (const o of (p.offerings || [])) {
        if (o.locationId && !seen.has(o.locationId)) {
          seen.add(o.locationId)
          base.push({
            id: o.locationId,
            name: o.locationName || String(o.locationId).replace(/^loc_/, '').replace(/_/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase()),
            color: LPAL[(i++) % LPAL.length],
          })
        }
      }
    }
    return base
  }, [viewState.locations, programs])
  const locIndex = useMemo(() => Object.fromEntries(locations.map(l => [l.id, l])), [locations])
  const locColor = useCallback(id => (locIndex[id]?.color) || '#5FA09E', [locIndex])

  /* ---------- categories & subjects: persisted order/colours, extended by anything new ---------- */
  const categoryOrder = useMemo(() => {
    const present = [...new Set(programs.map(p => p.category).filter(Boolean))]
    return viewState.categoryOrder.concat(
      present.filter(c => !viewState.categoryOrder.includes(c)).sort((a, b) => a.localeCompare(b)))
  }, [viewState.categoryOrder, programs])
  const subjectsOf = useCallback((cat) => {
    const ordered = (viewState.subjOrder && viewState.subjOrder[cat]) || []
    const present = [...new Set(programs.filter(p => p.category === cat).map(p => p.subject).filter(Boolean))]
    return ordered.concat(present.filter(s => !ordered.includes(s)).sort((a, b) => a.localeCompare(b)))
  }, [viewState.subjOrder, programs])
  const catColors = useMemo(() => {
    const out = {}
    categoryOrder.forEach(c => { out[c] = viewState.catColors[c] || DEFAULT_CAT_COLOR })
    return out
  }, [categoryOrder, viewState.catColors])
  const subjColors = useMemo(() => {
    const out = {}
    programs.forEach(p => {
      if (p.category && p.subject) {
        out[p.category + '\u0000' + p.subject] = viewState.subjColors[p.category + '\u0000' + p.subject] || DEFAULT_CAT_COLOR
      }
    })
    return out
  }, [programs, viewState.subjColors])
  const catColor = useCallback(c => catColors[c] || DEFAULT_CAT_COLOR, [catColors])
  const subjColor = useCallback(
    (cat, s) => subjColors[(cat || '') + '\u0000' + (s || '')] || DEFAULT_CAT_COLOR, [subjColors])
  const catOrderIndex = useCallback(c => {
    const i = categoryOrder.indexOf(c)
    return i < 0 ? 999 : i
  }, [categoryOrder])
  /* Only the categories actually in use appear in the Category filter. */
  const usedCategories = useMemo(() => {
    const present = new Set(programs.map(p => p.category).filter(Boolean))
    return categoryOrder.filter(c => present.has(c))
  }, [categoryOrder, programs])

  /* ---------- mutation with undo history ---------- */
  const mutate = useCallback((fn) => {
    setPrograms(list => {
      const before = JSON.stringify(list)
      const next = fn(list)
      const after = JSON.stringify(next)
      if (before !== after) {
        setHistory(h => ({ undo: [...h.undo, before].slice(-150), redo: [] }))
      }
      return next
    })
  }, [setPrograms])

  const doUndo = () => {
    if (!history.undo.length) return
    setPrograms(list => {
      const cur = JSON.stringify(list)
      const prev = history.undo[history.undo.length - 1]
      setHistory(h => ({ undo: h.undo.slice(0, -1), redo: [...h.redo, cur] }))
      return JSON.parse(prev)
    })
  }
  const doRedo = () => {
    if (!history.redo.length) return
    setPrograms(list => {
      const cur = JSON.stringify(list)
      const nxt = history.redo[history.redo.length - 1]
      setHistory(h => ({ undo: [...h.undo, cur], redo: h.redo.slice(0, -1) }))
      return JSON.parse(nxt)
    })
  }
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (editing || bulkOpen || settingsOpen) return
        e.preventDefault()
        if (e.shiftKey) doRedo(); else doUndo()
      }
      if (e.key === 'Escape') { setPop(null); setCellEdit(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  /* close popovers on outside click */
  useEffect(() => {
    if (!pop) return
    const h = e => { if (popRef.current && !popRef.current.contains(e.target)) setPop(null) }
    const t = setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h) }
  }, [pop])

  /* ---------- rows ---------- */
  const allRows = useMemo(() => buildRows(programs, locIndex), [programs, locIndex])

  const filterSel = useCallback((key) => {
    if (key.indexOf('gen:') === 0) return filters.gen[key.slice(4)] || []
    return filters[key] || []
  }, [filters])

  const setFilterSel = useCallback((key, arr) => {
    setFilters(f => key.indexOf('gen:') === 0
      ? { ...f, gen: { ...f.gen, [key.slice(4)]: arr } }
      : { ...f, [key]: arr })
  }, [])

  const filterOptions = useCallback((key) => {
    if (key.indexOf('gen:') === 0) {
      const ck = key.slice(4)
      const seen = new Map()
      allRows.forEach(r => { const v = colValue(r, ck); if (v !== '' && !seen.has(v)) seen.set(v, colLabel(r, ck)) })
      return [...seen.entries()]
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))
        .map(([value, label]) => ({ value, label }))
    }
    if (key === 'cat') return usedCategories.map(c => ({ value: c, label: c }))
    if (key === 'prog') return [...new Set(programs.map(p => p.name).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)).map(x => ({ value: x, label: x }))
    if (key === 'sub') return [...new Set(programs.map(p => p.subject).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b)).map(x => ({ value: x, label: x }))
    if (key === 'year') return [...new Set(programs.map(p => p.year).filter(Boolean))]
      .sort().map(x => ({ value: x, label: x }))
    if (key === 'grade') return [...new Set(programs.map(p => p.ageRange).filter(Boolean))]
      .sort().map(v => ({ value: v, label: fmtGrade(v) }))
    if (key === 'locf') return locations.map(l => ({ value: l.id, label: l.name }))
    if (key === 'platform') return PLATFORMS.map(x => ({ value: x, label: x }))
    if (key === 'day') return DOW.map(d => ({ value: String(d.n), label: d.l }))
    if (key === 'time') return [...new Set(allRows.map(r => r.slot?.start).filter(Boolean))]
      .sort().map(x => ({ value: x, label: fmtTime(x) }))
    if (key === 'cost') return [...new Set(allRows.map(r => r.cost).filter(v => v != null).map(String))]
      .sort((a, b) => Number(a) - Number(b)).map(x => ({ value: x, label: money(Number(x)) }))
    if (key === 'dur') return [...new Set(allRows.map(r => r.duration).filter(v => v !== '' && v != null).map(String))]
      .sort((a, b) => Number(a) - Number(b)).map(v => ({ value: v, label: fmtDuration(v) }))
    return []
  }, [allRows, programs, locations, usedCategories])

  const matchRow = useCallback((r) => {
    if (filters.prog.length && !filters.prog.includes(r.name)) return false
    if (filters.cat.length && !filters.cat.includes(r.category)) return false
    if (filters.sub.length && !filters.sub.includes(r.subject)) return false
    if (filters.year.length && !filters.year.includes(r.year)) return false
    if (filters.grade.length && !filters.grade.includes(r.age)) return false
    if (filters.locf.length && !filters.locf.includes(r.locId)) return false
    if (filters.platform.length && !filters.platform.includes(r.platform)) return false
    if (filters.day.length && !filters.day.includes(String(r.day))) return false
    if (filters.time.length && !(r.slot && filters.time.includes(r.slot.start))) return false
    if (filters.cost.length && !filters.cost.includes(r.cost == null ? '' : String(r.cost))) return false
    if (filters.dur.length && !filters.dur.includes(r.duration === '' || r.duration == null ? '' : String(r.duration))) return false
    for (const ck in filters.gen) {
      const sel = filters.gen[ck]
      if (sel && sel.length && !sel.includes(colValue(r, ck))) return false
    }
    if (enrolFilter) {
      const cap = Number(r.capacity), en = Number(r.enrolled)
      const left = (isFinite(cap) ? cap : 0) - (isFinite(en) ? en : 0)
      if (enrolFilter === 'open' && !(isFinite(cap) && cap > 0 && left > 0)) return false
      if (enrolFilter === 'full' && !(isFinite(cap) && cap > 0 && left <= 0)) return false
    }
    const t = search.trim().toLowerCase()
    if (t) {
      const hay = (r.name + ' ' + r.desc + ' ' + r.instructor + ' ' + r.category + ' ' +
        r.subject + ' ' + r.locName + ' ' + r.code + ' ' + r.number).toLowerCase()
      if (!hay.includes(t)) return false
    }
    return true
  }, [filters, enrolFilter, search])

  const rs = useMemo(() => {
    const list = allRows.filter(matchRow)
    const k = sort.key, dir = sort.dir
    const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n }
    const val = r => {
      switch (k) {
        case 'number': { const n = num(r.number); return n == null ? Infinity : n }
        case 'code': return (r.code || '~').toLowerCase()
        case 'name': return (r.name || '').toLowerCase()
        case 'subject': return (r.subject || '~').toLowerCase()
        case 'category': return catOrderIndex(r.category)
        case 'age': return gradeRank(r.gradeFrom) * 100 + gradeRank(r.gradeTo)
        case 'location': return (r.locName || '').toLowerCase()
        case 'days': return r.day == null ? 99 : DOW_ORD[r.day]
        case 'time': return (r.slot && r.slot.start) || '~'
        case 'duration': { const n = parseFloat(r.duration); return isNaN(n) ? -1 : n }
        case 'lessons': { const n = parseFloat(r.sessions); return isNaN(n) ? -1 : n }
        case 'cost': return r.cost == null ? -1 : r.cost
        case 'rate': return r.rate == null ? -1 : r.rate
        case 'hours': return r.hours == null ? -1 : r.hours
        case 'year': return r.year || '~'
        case 'platform': return (r.platform || '~').toLowerCase()
        case 'active': return r.active ? 0 : 1
        case 'instructor': return (r.instructor || '~').toLowerCase()
        case 'spots': {
          const c = Number(r.capacity), e = Number(r.enrolled)
          return isFinite(c) && c > 0 ? c - (isFinite(e) ? e : 0) : -1
        }
        default: return 0
      }
    }
    /* Keep a program's entries together: sort by the chosen key, then by program, day, time. */
    return list.slice().sort((a, b) => {
      const va = val(a), vb = val(b)
      if (va < vb) return -1 * dir
      if (va > vb) return 1 * dir
      const fa = famKey(a), fb = famKey(b)
      if (fa !== fb) return fa < fb ? -1 : 1
      const da = a.day == null ? 99 : DOW_ORD[a.day], db = b.day == null ? 99 : DOW_ORD[b.day]
      if (da !== db) return da - db
      return ((a.slot?.start) || '').localeCompare((b.slot?.start) || '')
    })
  }, [allRows, matchRow, sort, catOrderIndex])

  /* whole-program-dead runs, for the grey treatment */
  const deadRun = useMemo(() => {
    const out = new Array(rs.length).fill(false)
    let i = 0
    while (i < rs.length) {
      const k = famKey(rs[i]); let j = i
      while (j < rs.length && famKey(rs[j]) === k) j++
      let live = false
      for (let t = i; t < j; t++) if (rs[t].active) { live = true; break }
      if (!live) for (let t = i; t < j; t++) out[t] = true
      i = j
    }
    return out
  }, [rs])

  /* metrics describe what is on screen */
  const metrics = useMemo(() => {
    const fams = new Map()
    rs.forEach(r => { const k = famKey(r); if (!fams.has(k)) fams.set(k, false); if (r.active) fams.set(k, true) })
    let act = 0; fams.forEach(v => { if (v) act++ })
    const shownProg = new Set(rs.map(r => r.progId))
    const shownOff = new Set(rs.map(r => r.offId).filter(Boolean))
    let open = 0, roomy = 0
    programs.filter(p => shownProg.has(p.id)).forEach(p => (p.offerings || []).forEach(o => {
      if (!shownOff.has(o.id)) return
      const c = Number(o.capacity), e = Number(o.enrolled)
      if (isFinite(c) && c > 0) { const left = c - (isFinite(e) ? e : 0); if (left > 0) { open += left; roomy++ } }
    }))
    let mins = 0; rs.forEach(r => { const d = Number(r.duration); if (isFinite(d)) mins += d })
    return {
      progs: fams.size, entries: rs.length, act, inact: fams.size - act,
      open, roomy, hours: Math.round(mins / 60 * 10) / 10,
    }
  }, [rs, programs])

  const orderedCols = useMemo(
    () => colOrder.map(k => COL[k]).filter(c => c && c.l && !hiddenCols[c.k]),
    [colOrder, hiddenCols])
  const anyColHidden = useMemo(() => COLS.some(c => c.l && hiddenCols[c.k]), [hiddenCols])

  /* prune stale selections */
  const validKeys = useMemo(() => new Set(rs.map(rowKey)), [rs])
  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(k => validKeys.has(k)))
      return next.size === prev.size ? prev : next
    })
  }, [validKeys])

  /* ---------- cell content ---------- */
  const cellsFor = useCallback((r) => {
    const cap = Number(r.capacity), en = Number(r.enrolled)
    let spots
    if (isFinite(cap) && cap > 0) {
      const left = cap - (isFinite(en) ? en : 0)
      spots = <span className="enr">
        <span className="spots cnt">{isFinite(en) ? en : 0} / {cap}</span>
        <span className={'spots ' + (left <= 0 ? 'full' : 'ok')}>{left <= 0 ? 'full' : left + ' left'}</span>
      </span>
    } else if (isFinite(en) && en > 0) {
      spots = <span className="enr"><span className="spots cnt">{en} enrolled</span></span>
    } else spots = <span className="spots none">—</span>

    const dash = <span className="hint">—</span>
    return {
      number: r.number || dash,
      code: r.code ? <span className="mono">{r.code}</span> : dash,
      name: <div className="prog-name">{r.name || <span className="hint">Untitled</span>}</div>,
      active: <button className="actbtn">{r.active ? 'Active' : 'Inactive'}</button>,
      subject: r.subject || dash,
      category: r.category ? <span className="catpill">{r.category}</span> : dash,
      year: r.year || dash,
      age: fmtGrade(r.age) || dash,
      location: r.locName
        ? <span className="loc"><span className="dot" style={{ background: locColor(r.locId) }} />{r.locName}</span>
        : dash,
      platform: r.platform || dash,
      days: r.day == null ? dash : ((DOW.find(x => x.n === r.day) || {}).l || dash),
      time: r.slot && fmtRange(r.slot) ? fmtRange(r.slot) : dash,
      duration: (r.duration !== '' && r.duration != null) ? fmtDuration(r.duration) : dash,
      lessons: r.sessions ? String(r.sessions) + (r.period || '') : dash,
      cost: r.cost == null ? dash
        : <span className="cost">{money(r.cost)}{r.costUnit ? <> <span className="hint">{r.costUnit}</span></> : null}</span>,
      rate: r.rate == null ? dash
        : <span className="cost">{money(r.rate)}<span className="hint">/hr</span></span>,
      hours: r.hours == null ? dash : r.hours + ' h',
      spots,
      instructor: r.instructor || dash,
    }
  }, [locColor])

  /* A stable string per cell, used both for repeat suppression and identical-row collapse. */
  const cellSig = useCallback((r, k) => {
    switch (k) {
      case 'number': return r.number || '—'
      case 'code': return r.code || '—'
      case 'name': return r.name || 'Untitled'
      case 'active': return r.active ? 'Active' : 'Inactive'
      case 'subject': return r.subject || '—'
      case 'category': return r.category || '—'
      case 'year': return r.year || '—'
      case 'age': return fmtGrade(r.age) || '—'
      case 'location': return r.locName || '—'
      case 'platform': return r.platform || '—'
      case 'days': return r.day == null ? '—' : ((DOW.find(x => x.n === r.day) || {}).l || '—')
      case 'time': return (r.slot && fmtRange(r.slot)) || '—'
      case 'duration': return (r.duration !== '' && r.duration != null) ? fmtDuration(r.duration) : '—'
      case 'lessons': return r.sessions ? String(r.sessions) + (r.period || '') : '—'
      case 'cost': return r.cost == null ? '—' : money(r.cost) + (r.costUnit || '')
      case 'rate': return r.rate == null ? '—' : money(r.rate) + '/hr'
      case 'hours': return r.hours == null ? '—' : r.hours + ' h'
      case 'spots': return colValue(r, 'spots') || '—'
      case 'instructor': return r.instructor || '—'
      default: return ''
    }
  }, [])

  /* ---------- actions ---------- */
  const toggleActive = (progId) =>
    mutate(list => list.map(p => p.id === progId ? { ...p, active: p.active === false } : p))

  const openEdit = (progId) => {
    const p = programs.find(x => x.id === progId)
    if (p) setEditing({ mode: 'edit', program: JSON.parse(JSON.stringify(p)) })
  }
  const addProgram = () => setEditing({
    mode: 'new',
    program: {
      id: 'p_' + uid(), number: '', code: '', name: '', subject: '', category: '', ageRange: '',
      duration: 55, sessions: '1', period: '/week', rate: null, totalHours: null, description: '',
      year: '', gradeFrom: '', gradeTo: '', platform: 'In-Person', cost: null, costUnit: '', active: true,
      offerings: [{ id: 's' + uid(), locationId: locations[0]?.id || 'loc_boardwalk', days: [], times: [], capacity: null, enrolled: '', instructor: '' }],
    },
  })
  const saveProgram = (form) => {
    if (!String(form.name || '').trim()) { dialog.alert('Missing Name', 'Please enter a program name.'); return }
    mutate(list => {
      const next = {
        ...form,
        name: String(form.name).trim(),
        code: form.code || autoCode(form.name),
        totalHours: computeTotalHours(form.duration, form.sessions, form.period),
      }
      const temp = editing.mode === 'new' ? [next, ...list] : list.map(p => p.id === next.id ? next : p)
      return genProgramIds(temp, categoryOrder, subjOrder, locations)
    })
    setEditing(null)
  }
  const duplicateProgram = (progId) => mutate(list => {
    const i = list.findIndex(p => p.id === progId)
    if (i < 0) return list
    const o = list[i]
    const dup = {
      ...o, id: 'p_' + uid(), name: o.name,
      offerings: (o.offerings || []).map(of => ({
        ...of, id: 's' + uid(), days: [...(of.days || [])], times: (of.times || []).map(t => ({ ...t })),
      })),
    }
    return [...list.slice(0, i + 1), dup, ...list.slice(i + 1)]
  })
  const deleteProgram = async (progId) => {
    const p = programs.find(x => x.id === progId)
    if (!p) return
    if (!await dialog.confirm(`Delete "${p.name || 'Untitled'}" and all its scheduled entries?`)) return
    mutate(list => list.filter(x => x.id !== progId))
  }

  /* inline cell commit */
  const commitCell = (r, k, raw) => {
    const spec = CELL_EDIT[k]
    if (!spec) return
    setCellEdit(null)
    if (spec.on === 'prog') {
      let v = raw
      if (spec.num) v = raw === '' ? null : Number(raw)
      mutate(list => list.map(p => p.id === r.progId ? { ...p, [spec.f]: v } : p))
      return
    }
    if (spec.on === 'off') {
      mutate(list => list.map(p => p.id !== r.progId ? p : {
        ...p,
        offerings: (p.offerings || []).map(o => o.id === r.offId ? { ...o, [spec.f]: raw } : o),
      }))
      return
    }
    if (spec.on === 'day') {
      const nd = raw === '' ? null : Number(raw)
      if (nd == null) return
      mutate(list => list.map(p => p.id !== r.progId ? p : {
        ...p,
        offerings: (p.offerings || []).map(o => {
          if (o.id !== r.offId) return o
          const days = (o.days || []).map(d => d === r.day ? nd : d)
          return { ...o, days: [...new Set(days)] }
        }),
      }))
      return
    }
    if (spec.on === 'slot') {
      if (!raw) return
      mutate(list => list.map(p => p.id !== r.progId ? p : {
        ...p,
        offerings: (p.offerings || []).map(o => {
          if (o.id !== r.offId) return o
          const times = offTimes(o).map((t, i) => {
            if (i !== r.slotIndex) return t
            /* keep the length of the slot when the start moves */
            const dur = (() => {
              const [sh, sm] = String(t.start || '').split(':').map(Number)
              const [eh, em] = String(t.end || '').split(':').map(Number)
              if ([sh, sm, eh, em].some(isNaN)) return null
              return (eh * 60 + em) - (sh * 60 + sm)
            })()
            let end = t.end
            if (dur != null) {
              const [nh, nm] = raw.split(':').map(Number)
              const tot = nh * 60 + nm + dur
              end = String(Math.floor(tot / 60) % 24).padStart(2, '0') + ':' + String(tot % 60).padStart(2, '0')
            }
            return { start: raw, end }
          })
          return { ...o, times }
        }),
      }))
    }
  }

  /* bulk */
  const selectedProgIds = useMemo(() => {
    const ids = new Set()
    rs.forEach(r => { if (selected.has(rowKey(r))) ids.add(r.progId) })
    return ids
  }, [rs, selected])
  const bulkDelete = async () => {
    if (!selectedProgIds.size) return
    if (!await dialog.confirm(`Delete ${selectedProgIds.size} program(s) and all their entries?`)) return
    mutate(list => list.filter(p => !selectedProgIds.has(p.id)))
    setSelected(new Set())
  }
  const applyBulk = (patch, dayPatch, activePatch) => {
    const offIds = new Set()
    rs.forEach(r => { if (selected.has(rowKey(r)) && r.offId) offIds.add(r.offId) })
    mutate(list => list.map(p => {
      if (!selectedProgIds.has(p.id)) return p
      const np = { ...p }
      for (const [k, v] of Object.entries(patch.prog)) np[k] = v
      if (activePatch != null) np.active = activePatch
      np.offerings = (p.offerings || []).map(o => {
        if (!offIds.has(o.id)) return o
        const no = { ...o }
        for (const [k, v] of Object.entries(patch.off)) no[k] = v
        if (dayPatch) no.days = [...dayPatch]
        if (patch.time && (patch.time.start || patch.time.end)) {
          no.times = offTimes(o).map(t => ({
            start: patch.time.start || t.start, end: patch.time.end || t.end,
          }))
          if (!no.times.length) no.times = [{ start: patch.time.start || '', end: patch.time.end || '' }]
        }
        return no
      })
      return np
    }))
    setBulkOpen(false)
    setSelected(new Set())
  }

  const exportCsv = () => {
    const header = ['Program ID', 'Program Code', 'Program', 'Active', 'Subject', 'Category', 'Year',
      'Grade', 'Location', 'Day', 'Start', 'End', 'Platform', 'Duration (min)', '# Of Lessons', 'Per',
      'Cost', 'Cost Per', 'Rate/Hr', 'Total Hrs', 'Capacity', 'Enrolled', 'Instructor']
    const body = allRows.map(r => [r.number, r.code, r.name, r.active ? 'Active' : 'Inactive', r.subject,
      r.category, r.year, r.age, r.locName,
      r.day == null ? '' : (DOW.find(d => d.n === r.day) || {}).l || '',
      r.slot?.start || '', r.slot?.end || '', r.platform, r.duration, r.sessions, r.period,
      r.cost, r.costUnit, r.rate, r.hours, r.capacity, r.enrolled, r.instructor])
    const csv = [header, ...body].map(row => row.map(c => {
      const s = c == null ? '' : String(c)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'crania-programs.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  /* Create Schedule — draws what is on screen as a weekly grid PNG. */
  const createScheduleImage = () => {
    const days = DOW.filter(d => rs.some(r => r.day === d.n))
    if (!days.length) { dialog.alert('Nothing To Draw', 'Nothing is scheduled in the current view.'); return }
    const byDay = new Map(days.map(d => [d.n, rs.filter(r => r.day === d.n)
      .slice().sort((a, b) => ((a.slot?.start) || '').localeCompare((b.slot?.start) || ''))]))
    const maxRows = Math.max(...days.map(d => byDay.get(d.n).length))
    const CW = 260, RH = 46, HH = 44, PAD = 20, TITLE = 46
    const W = PAD * 2 + CW * days.length, H = PAD * 2 + TITLE + HH + RH * maxRows
    const cv = document.createElement('canvas')
    const scale = 2
    cv.width = W * scale; cv.height = H * scale
    const x = cv.getContext('2d')
    x.scale(scale, scale)
    x.fillStyle = '#fff'; x.fillRect(0, 0, W, H)
    x.fillStyle = '#2E2516'; x.font = 'bold 20px "Segoe UI",system-ui,sans-serif'
    x.textBaseline = 'middle'
    x.fillText('Crania Schools — Schedule', PAD, PAD + 16)
    days.forEach((d, di) => {
      const cx = PAD + di * CW
      x.fillStyle = '#5FA09E'
      x.beginPath(); x.roundRect(cx + 3, PAD + TITLE, CW - 6, HH - 8, 6); x.fill()
      x.fillStyle = '#fff'; x.font = 'bold 13px "Segoe UI",system-ui,sans-serif'
      x.textAlign = 'center'
      x.fillText(d.l.toUpperCase(), cx + CW / 2, PAD + TITLE + (HH - 8) / 2)
      x.textAlign = 'left'
      byDay.get(d.n).forEach((r, ri) => {
        const cy = PAD + TITLE + HH + ri * RH
        const tint = r.category ? catColor(r.category) : '#F1F3F4'
        x.fillStyle = tint
        x.beginPath(); x.roundRect(cx + 3, cy, CW - 6, RH - 6, 5); x.fill()
        x.fillStyle = isDarkColor(tint) ? '#fff' : '#2E2516'
        x.font = 'bold 11.5px "Segoe UI",system-ui,sans-serif'
        const nm = (r.name || 'Untitled')
        x.fillText(nm.length > 34 ? nm.slice(0, 33) + '…' : nm, cx + 11, cy + 13)
        x.font = '10.5px "Segoe UI",system-ui,sans-serif'
        const sub = [fmtRange(r.slot), r.locName, r.instructor].filter(Boolean).join(' · ')
        x.fillText(sub.length > 42 ? sub.slice(0, 41) + '…' : sub, cx + 11, cy + 28)
      })
    })
    cv.toBlob(b => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = 'crania-schedule.png'
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }

  /* ---------- header interactions ---------- */
  const onSort = (k) => setSort(s => s.key === k ? { key: k, dir: -s.dir } : { key: k, dir: 1 })
  const hideCol = (k) => setHiddenCols(h => ({ ...h, [k]: true }))
  const onDragStart = (k) => { dragCol.current = k }
  const onDrop = (k) => {
    const from = dragCol.current
    dragCol.current = null
    if (!from || from === k) return
    setColOrder(order => {
      const next = order.filter(c => c !== from)
      const i = next.indexOf(k)
      next.splice(i < 0 ? next.length : i, 0, from)
      return next
    })
  }

  /* ---------- render ---------- */
  let prevRow = null, prevSig = null, prevVisKey = null, shownCount = 0
  const bodyRows = []
  rs.forEach((r, ri) => {
    const key = rowKey(r)
    const sig = {}
    orderedCols.forEach(c => { sig[c.k] = cellSig(r, c.k) })
    const visKey = orderedCols.map(c => sig[c.k]).join('')
    if (anyColHidden && prevVisKey !== null && visKey === prevVisKey) return
    prevVisKey = visKey

    const cells = cellsFor(r)
    const sameProg = prevRow && famKey(prevRow) === famKey(r)
    const sameCat = prevRow && (prevRow.category || '') === (r.category || '')
    const sameSubj = sameCat && (prevRow.subject || '') === (r.subject || '')
    const showSep = prevRow && !sameProg
    let shownCells = 0

    const tds = orderedCols.map(c => {
      const k = c.k
      const same = prevRow && sig[k] === prevSig[k] && (
        REPEATABLE[k] ||
        (REPEATABLE_IN_PROGRAM[k] && sameProg) ||
        (REPEATABLE_IN_CATEGORY[k] && sameCat) ||
        (REPEATABLE_IN_CAT_SUBJ[k] && sameSubj))
      const editable = !!CELL_EDIT[k]
      if (same) return <td key={k} className={`col-${k} rep`} data-ek={editable ? k : undefined} />
      shownCells++

      const isEditing = cellEdit && cellEdit.key === key && cellEdit.col === k
      if (isEditing) {
        return <td key={k} className={`col-${k} editing`}>
          <CellEditor row={r} col={k} locations={locations} programs={programs}
            categories={categoryOrder} teacherOptions={teacherOptions}
            onCommit={v => commitCell(r, k, v)} onCancel={() => setCellEdit(null)} />
        </td>
      }

      let cls = `col-${k}`, style
      if (k === 'active') {
        const ac = r.active ? '#DEF2DE' : '#FADBD8', at = r.active ? '#2C6B2E' : '#922B21'
        cls = 'col-active tint'
        style = { '--tint': ac, color: at }
        return <td key={k} className={cls} style={style} data-ek={editable ? k : undefined}
          onClick={() => toggleActive(r.progId)}>{cells[k]}</td>
      }
      if (k === 'category' && r.category) {
        const cc = catColor(r.category)
        if (cc !== DEFAULT_CAT_COLOR) {
          cls = 'col-category tint'
          style = { '--tint': cc, color: isDarkColor(cc) ? '#fff' : 'var(--dark-brown)' }
        }
      } else if (k === 'subject' && r.subject) {
        const sc = subjColor(r.category || '', r.subject)
        if (sc !== DEFAULT_CAT_COLOR) {
          cls = 'col-subject tint'
          style = { '--tint': sc, color: isDarkColor(sc) ? '#fff' : 'var(--dark-brown)' }
        }
      }
      return <td key={k} className={cls} style={style} data-ek={editable ? k : undefined}
        onClick={editable ? (e => {
          if (e.target.closest('button,input,select')) return
          setCellEdit({ key, col: k })
        }) : undefined}>{cells[k]}</td>
    })

    prevRow = r; prevSig = sig
    if (!shownCells) return
    shownCount++

    if (showSep) {
      bodyRows.push(
        <tr className="progsep" key={key + '-sep'}>
          <td className="nosep" />
          <td colSpan={orderedCols.length} />
          <td className="nosep" />
          <td className="nosep filler" />
        </tr>)
    }
    const isSel = selected.has(key)
    bodyRows.push(
      <tr key={key} className={[isSel ? 'sel' : '', r.active ? '' : (deadRun[ri] ? 'rdead' : 'rinactive')]
        .filter(Boolean).join(' ')}
        title="Click a cell to edit it; ✎ opens the full box">
        <td className="selcol">
          <input type="checkbox" checked={isSel} onChange={e => setSelected(prev => {
            const n = new Set(prev)
            if (e.target.checked) n.add(key); else n.delete(key)
            return n
          })} />
        </td>
        {tds}
        <td className="actcell">
          <button className="rowbtn rb-pen" title="Open the full edit box" onClick={() => openEdit(r.progId)}>✎</button>
          <button className="rowbtn rb-dup" title="Duplicate this program" onClick={() => duplicateProgram(r.progId)}>⧉</button>
          <button className="rowbtn rb-del" title="Delete this program" onClick={() => deleteProgram(r.progId)}>×</button>
        </td>
        <td className="filler" />
      </tr>)
  })

  const allSel = rs.length > 0 && rs.every(r => selected.has(rowKey(r)))
  const arrow = k => sort.key === k ? <span className="arw">{sort.dir > 0 ? '▲' : '▼'}</span> : null

  return (
    <div className="page pg" style={{ paddingBottom: 32 }}>
      <style>{CSS}</style>
      <h2 className="page-title">Programs</h2>

      <div className="actions">
        <button title="Undo (Ctrl+Z)" disabled={!history.undo.length} onClick={doUndo}>↶ Undo</button>
        <button title="Redo (Ctrl+Shift+Z)" disabled={!history.redo.length} onClick={doRedo}>↷</button>
        <button title="Draw the schedule currently on screen as an image"
          style={{ marginLeft: 'auto' }} onClick={createScheduleImage}>🖼 Create Schedule</button>
        <button title="Choose which columns are shown"
          onClick={e => setPop({ kind: 'cols', rect: e.currentTarget.getBoundingClientRect() })}>👁 Columns</button>
        <button title="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>
        <button title="Download all programs as a CSV file" onClick={exportCsv}>⤓ Export CSV</button>
      </div>

      <div className="metrics">
        <div className="metric">
          <div className="label">Programs</div><div className="value">{metrics.progs}</div>
          <div className="hint">{metrics.entries} scheduled {metrics.entries === 1 ? 'entry' : 'entries'}</div>
        </div>
        <div className="metric mact">
          <div className="label">Active</div><div className="value">{metrics.act}</div>
          <div className="hint">{metrics.inact} inactive</div>
        </div>
        <div className="metric mspots clickable" title="Click to show only offerings with room"
          onClick={() => setEnrolFilter(v => v === 'open' ? '' : 'open')}>
          <div className="label">Spots Open</div><div className="value">{metrics.open}</div>
          <div className="hint">across {metrics.roomy} {metrics.roomy === 1 ? 'class' : 'classes'}</div>
        </div>
        <div className="metric mhours">
          <div className="label">Weekly Hours</div><div className="value">{metrics.hours}</div>
          <div className="hint">contact hours across the week</div>
        </div>
      </div>

      <div className="filters">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search programs, instructors, codes…" autoComplete="off" />
        <select value={enrolFilter} onChange={e => setEnrolFilter(e.target.value)}>
          <option value="">Any Availability</option>
          <option value="open">Spots Open</option>
          <option value="full">Full</option>
        </select>
        <button className="addbtn" onClick={addProgram}>+ Add Program</button>
      </div>

      {selected.size > 0 && (
        <div className="bulkbar">
          <span className="n">{selected.size} selected</span>
          <span className="acts">
            <button className="edit" onClick={() => setBulkOpen(true)}>Edit Selected</button>
            <button className="del" onClick={bulkDelete}>Delete Selected</button>
            <button className="clr" onClick={() => setSelected(new Set())}>Clear Selection</button>
          </span>
        </div>
      )}

      <div className="card">
        {!programs.length ? (
          <div className="empty"><b>No programs yet.</b><br />Click “+ Add Program” to create your first one.</div>
        ) : !rs.length ? (
          <div className="empty"><b>Nothing to show.</b><br />Your search or filter is too narrow.</div>
        ) : (
          <table>
            <thead>
              <tr className="frow">
                <th />
                {orderedCols.map(c => {
                  const fk = FK[c.k]
                  if (!fk) return <th key={c.k} />
                  const n = filterSel(fk).length
                  return (
                    <th key={c.k}>
                      <button className={'colf' + (n ? ' on' : '')}
                        onClick={e => setPop({ kind: 'filter', fk, rect: e.currentTarget.getBoundingClientRect() })}>
                        {n ? n + ' ▾' : 'All ▾'}
                      </button>
                    </th>
                  )
                })}
                <th />
                <th className="filler" />
              </tr>
              <tr>
                <th className="selcol">
                  <input type="checkbox" checked={allSel} onChange={e =>
                    setSelected(e.target.checked ? new Set(rs.map(rowKey)) : new Set())} />
                </th>
                {orderedCols.map(c => (
                  <th key={c.k} className={'colh' + (c.gear ? ' hasgear' : '')} draggable
                    data-col={c.k}
                    onDragStart={() => onDragStart(c.k)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDrop(c.k)}>
                    <span className="lbl sortable" onClick={() => onSort(c.k)}>{c.l}</span>
                    <span className="thicons">
                      {arrow(c.k)}
                      {c.gear && <span className="gear" title={`Manage ${c.l}`}
                        onClick={e => {
                          e.stopPropagation()
                          if (c.gear === 'cat') setManaging('catsubj')
                          else if (c.gear === 'loc') setManaging('locations')
                        }}>⚙</span>}
                      <span className="eye" title="Hide Column"
                        onClick={e => { e.stopPropagation(); hideCol(c.k) }}>👁</span>
                    </span>
                  </th>
                ))}
                <th className="blankhead" />
                <th className="filler" />
              </tr>
            </thead>
            <tbody>{bodyRows}</tbody>
          </table>
        )}
      </div>
      <div className="tcount">Count={shownCount}{shownCount !== allRows.length ? ` of ${allRows.length}` : ''}</div>

      {pop && pop.kind === 'filter' && (
        <FilterPop ref={popRef} rect={pop.rect} fk={pop.fk}
          options={filterOptions(pop.fk)} selectedVals={filterSel(pop.fk)}
          onToggle={(v, on) => {
            const cur = filterSel(pop.fk)
            setFilterSel(pop.fk, on ? [...cur, v] : cur.filter(x => x !== v))
          }}
          onSelectAll={() => setFilterSel(pop.fk, filterOptions(pop.fk).map(o => o.value))}
          onClear={() => setFilterSel(pop.fk, [])} />
      )}

      {pop && pop.kind === 'cols' && (
        <ColsPop ref={popRef} rect={pop.rect} colOrder={colOrder} hiddenCols={hiddenCols}
          onToggle={(k, on) => setHiddenCols(h => {
            const n = { ...h }
            if (on) delete n[k]; else n[k] = true
            return n
          })}
          onAll={() => setHiddenCols({})}
          onNone={() => setHiddenCols(Object.fromEntries(COLS.filter(c => c.l && c.k !== 'name').map(c => [c.k, true])))} />
      )}

      {editing && (
        <ProgramModal mode={editing.mode} initial={editing.program} locations={locations}
          teacherOptions={teacherOptions} registrations={registrations}
          categories={categoryOrder}
          onClose={() => setEditing(null)} onSave={saveProgram}
          onDelete={editing.mode === 'edit' ? () => { deleteProgram(editing.program.id); setEditing(null) } : null} />
      )}

      {bulkOpen && (
        <BulkModal count={selected.size} locations={locations} categories={categoryOrder}
          onClose={() => setBulkOpen(false)} onApply={applyBulk} />
      )}

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} setPrograms={setPrograms} />
      )}

      {managing && (
        <ManageModal
          kind={managing}
          onClose={() => setManaging(null)}
          programs={programs}
          setPrograms={setPrograms}
          viewState={viewState}
          setViewState={setViewState}
        />
      )}
    </div>
  )
}

/* ================= popovers ================= */
const FilterPop = React.forwardRef(function FilterPop(
  { rect, fk, options, selectedVals, onToggle, onSelectAll, onClear }, ref) {
  const style = {
    left: Math.min(rect.left, window.innerWidth - 220),
    top: rect.bottom + 6,
  }
  return (
    <div className="pgpop" ref={ref} style={style}>
      <div className="h">Filter — {FK_TITLE[fk] || fk}</div>
      <div className="selbar">
        <span className="sa" onClick={onSelectAll}>Select All</span>
        <span className="cl" onClick={onClear}>Clear</span>
      </div>
      {!options.length && <div className="ch">No options</div>}
      {options.map(op => (
        <label className="ch" key={op.value}>
          <input type="checkbox" checked={selectedVals.includes(op.value)}
            onChange={e => onToggle(op.value, e.target.checked)} />
          <span>{op.label}</span>
        </label>
      ))}
    </div>
  )
})

const ColsPop = React.forwardRef(function ColsPop(
  { rect, colOrder, hiddenCols, onToggle, onAll, onNone }, ref) {
  const style = { left: Math.min(rect.left, window.innerWidth - 210), top: rect.bottom + 6 }
  const menuCols = colOrder.map(k => COL[k]).filter(c => c && c.l && c.k !== 'name')
  COLS.filter(c => c.l && c.k !== 'name').forEach(c => { if (!menuCols.includes(c)) menuCols.push(c) })
  return (
    <div className="pgpop" ref={ref} style={style}>
      <div className="h">Show Columns</div>
      {menuCols.map(c => (
        <label className="ch" key={c.k}>
          <input type="checkbox" checked={!hiddenCols[c.k]}
            onChange={e => onToggle(c.k, e.target.checked)} />
          <span>{c.l}</span>
        </label>
      ))}
      <div className="allrow">
        <button type="button" onClick={onAll}>Select All</button>
        <button type="button" onClick={onNone}>Clear All</button>
      </div>
    </div>
  )
})

/* ================= inline cell editor ================= */
function CellEditor({ row, col, locations, programs, categories, teacherOptions, onCommit, onCancel }) {
  const spec = CELL_EDIT[col]
  const initial = (() => {
    switch (col) {
      case 'number': return row.number
      case 'code': return row.code
      case 'name': return row.name
      case 'subject': return row.subject
      case 'category': return row.category
      case 'year': return row.year
      case 'age': return row.age
      case 'platform': return row.platform
      case 'duration': return row.duration
      case 'lessons': return row.sessions
      case 'cost': return row.cost == null ? '' : row.cost
      case 'instructor': return row.instructor
      case 'location': return row.locId
      case 'days': return row.day == null ? '' : String(row.day)
      case 'time': return row.slot?.start || ''
      default: return ''
    }
  })()
  const [val, setVal] = useState(initial)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus(); if (ref.current?.select) ref.current.select() }, [])

  const list = (() => {
    if (col === 'location') return locations.map(l => ({ v: l.id, l: l.name }))
    if (col === 'days') return DOW.map(d => ({ v: String(d.n), l: d.l }))
    if (col === 'platform') return PLATFORMS.map(p => ({ v: p, l: p }))
    if (col === 'category') return categories.map(c => ({ v: c, l: c }))
    return null
  })()

  const done = () => onCommit(val)
  const onKey = e => {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); done() }
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  if (list) {
    return (
      <select className="cellin" ref={ref} value={val} onKeyDown={onKey}
        onChange={e => { setVal(e.target.value); onCommit(e.target.value) }} onBlur={onCancel}>
        <option value="">—</option>
        {list.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    )
  }
  if (col === 'time') {
    return <input className="cellin" ref={ref} type="time" value={val} onKeyDown={onKey}
      onChange={e => setVal(e.target.value)} onBlur={done} />
  }
  if (col === 'subject' || col === 'instructor') {
    const opts = col === 'subject'
      ? [...new Set(programs.map(p => p.subject).filter(Boolean))].sort()
      : teacherOptions
    const lid = 'ce-' + col
    return <>
      <input className="cellin" ref={ref} list={lid} value={val} onKeyDown={onKey}
        onChange={e => setVal(e.target.value)} onBlur={done} />
      <datalist id={lid}>{opts.map(o => <option key={o} value={o} />)}</datalist>
    </>
  }
  return <input className="cellin" ref={ref} type={spec.num ? 'number' : 'text'} value={val}
    onKeyDown={onKey} onChange={e => setVal(e.target.value)} onBlur={done} />
}

/* ================= program modal ================= */
function ProgramModal({ mode, initial, locations, teacherOptions, registrations, categories, onClose, onSave, onDelete }) {
  const dialog = useDialog()
  const [form, setForm] = useState(initial)
  const [activeOff, setActiveOff] = useState(0)
  const set = patch => setForm(f => ({ ...f, ...patch }))
  const offs = form.offerings || []
  const off = offs[activeOff] || null
  const setOff = patch => setForm(f => ({
    ...f, offerings: f.offerings.map((o, i) => i === activeOff ? { ...o, ...patch } : o),
  }))

  const addOffering = () => {
    setForm(f => ({
      ...f,
      offerings: [...(f.offerings || []), {
        id: 's' + uid(), locationId: locations[0]?.id || 'loc_boardwalk',
        days: [], times: [{ start: '16:30', end: '17:25' }], capacity: null, enrolled: '', instructor: '',
      }],
    }))
    setActiveOff(offs.length)
  }
  const removeOffering = () => {
    if (offs.length <= 1) return
    setForm(f => ({ ...f, offerings: f.offerings.filter((_, i) => i !== activeOff) }))
    setActiveOff(a => Math.max(0, a - 1))
  }
  const toggleDay = n => setOff({
    days: off.days.includes(n) ? off.days.filter(d => d !== n)
      : [...off.days, n].sort((a, b) => DOW_ORD[a] - DOW_ORD[b]),
  })
  const times = off ? offTimes(off) : []
  const setTime = (i, patch) => setOff({ times: times.map((t, j) => j === i ? { ...t, ...patch } : t) })
  const addTime = () => setOff({ times: [...times, { start: '', end: '' }] })
  const rmTime = i => setOff({ times: times.filter((_, j) => j !== i) })

  const enrolled = useMemo(() => {
    if (!registrations || !form.name) return []
    const target = form.name.toLowerCase()
    const out = []
    for (const rec of registrations) {
      const pl = rec.payload || rec
      const progs = pl.programs || pl.enrolledPrograms || []
      const hit = progs.some(pg => {
        const nm = typeof pg === 'string' ? pg : (pg.program || pg.name || pg.title || '')
        return nm.toLowerCase().includes(target)
      })
      if (hit) out.push(pl.displayName || `${pl.firstName || ''} ${pl.lastName || ''}`.trim() || pl.email || 'Unknown')
    }
    return out
  }, [registrations, form.name])

  useEffect(() => {
    const h = computeTotalHours(form.duration, form.sessions, form.period)
    if (h !== '') setForm(f => ({ ...f, totalHours: h }))
  }, [form.duration, form.sessions, form.period])

  const save = () => {
    if (!String(form.name || '').trim()) { dialog.alert('Missing Name', 'Please enter a program name.'); return }
    onSave({
      ...form, name: String(form.name).trim(),
      duration: form.duration === '' ? '' : Number(form.duration),
      rate: form.rate === '' || form.rate == null ? null : Number(form.rate),
      cost: form.cost === '' || form.cost == null ? null : Number(form.cost),
      totalHours: form.totalHours === '' || form.totalHours == null ? null : Number(form.totalHours),
    })
  }

  return (
    <div className="pgov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pgmodal" onClick={e => e.stopPropagation()}>
        <h2>{mode === 'edit' ? 'Edit Program' : 'New Program'}</h2>

        <div className="frow">
          <div className="field" style={{ flex: 'none', width: 104 }}>
            <label>Program #</label>
            <input value={form.number || ''} onChange={e => set({ number: e.target.value })} />
          </div>
          <div className="field">
            <label>Program Name</label>
            <input value={form.name || ''} onChange={e => set({ name: e.target.value })} autoFocus />
          </div>
        </div>
        <div className="frow">
          <div className="field"><label>Program Code</label>
            <input value={form.code || ''} onChange={e => set({ code: e.target.value })} /></div>
          <div className="field"><label>Year</label>
            <input value={form.year || ''} onChange={e => set({ year: e.target.value })} placeholder="e.g. 2026–27" /></div>
        </div>
        <div className="frow">
          <div className="field"><label>Category</label>
            <input list="pgCatList" value={form.category || ''} onChange={e => set({ category: e.target.value })} />
            <datalist id="pgCatList">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
          <div className="field"><label>Subject</label>
            <input value={form.subject || ''} onChange={e => set({ subject: e.target.value })} /></div>
        </div>
        <div className="frow">
          <div className="field"><label>Grade From</label>
            <select value={form.gradeFrom || ''} onChange={e => set({ gradeFrom: e.target.value })}>
              <option value="">—</option>{GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>Grade To</label>
            <select value={form.gradeTo || ''} onChange={e => set({ gradeTo: e.target.value })}>
              <option value="">—</option>{GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>Platform</label>
            <select value={form.platform || ''} onChange={e => set({ platform: e.target.value })}>
              <option value="">—</option>{PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select></div>
        </div>
        <div className="field"><label>Grade Range (label)</label>
          <input value={form.ageRange || ''} onChange={e => set({ ageRange: e.target.value })}
            placeholder="e.g. 1–10, or Up to 8" /></div>
        <div className="frow">
          <div className="field"><label>Duration (Min)</label>
            <input type="number" min="0" value={form.duration ?? ''} onChange={e => set({ duration: e.target.value })} /></div>
          <div className="field"><label># Of Lessons</label>
            <input value={form.sessions || ''} onChange={e => set({ sessions: e.target.value })} /></div>
          <div className="field"><label>Per</label>
            <select value={form.period || ''} onChange={e => set({ period: e.target.value })}>
              {PERIODS.map(p => <option key={p} value={p}>{p || '—'}</option>)}
            </select></div>
        </div>
        <div className="frow">
          <div className="field"><label>Cost ($)</label>
            <input type="number" min="0" step="0.01" value={form.cost ?? ''} onChange={e => set({ cost: e.target.value })} /></div>
          <div className="field"><label>Cost Per</label>
            <select value={form.costUnit || ''} onChange={e => set({ costUnit: e.target.value })}>
              {COST_UNITS.map(c => <option key={c} value={c}>{c || 'one-time'}</option>)}
            </select></div>
          <div className="field"><label>Rate ($/Hr)</label>
            <input type="number" min="0" step="0.01" value={form.rate ?? ''} onChange={e => set({ rate: e.target.value })} /></div>
        </div>
        <div className="frow">
          <div className="field"><label>Total Hrs</label>
            <input type="number" min="0" step="0.01" value={form.totalHours ?? ''} onChange={e => set({ totalHours: e.target.value })} /></div>
          <div className="field"><label>Status</label>
            <label className="bchk">
              <input type="checkbox" checked={form.active !== false} onChange={e => set({ active: e.target.checked })} />
              <span>Active</span>
            </label></div>
        </div>
        <div className="field"><label>Comments / Notes</label>
          <textarea rows={3} value={form.description || ''} onChange={e => set({ description: e.target.value })} /></div>

        <div className="sec-h">Offerings</div>
        <div className="offtabs">
          {offs.map((o, i) => (
            <button key={o.id} type="button" className={'offtab' + (i === activeOff ? ' on' : '')}
              onClick={() => setActiveOff(i)}>
              {(locations.find(l => l.id === o.locationId) || {}).name || 'Offering'} {i + 1}
            </button>
          ))}
          <button type="button" className="offtab add" onClick={addOffering}>+ Add Offering</button>
        </div>

        {off && (
          <div className="off">
            <div className="off-h">
              <div className="off-t">
                {(locations.find(l => l.id === off.locationId) || {}).name || 'Offering'} — Offering {activeOff + 1}
              </div>
              {offs.length > 1 && <button type="button" className="rmoff" onClick={removeOffering}>Remove</button>}
            </div>
            <div className="frow">
              <div className="field"><label>Location</label>
                <select value={off.locationId || ''} onChange={e => setOff({ locationId: e.target.value })}>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select></div>
              <div className="field"><label>Capacity</label>
                <input type="number" min="0" value={off.capacity ?? ''}
                  onChange={e => setOff({ capacity: e.target.value === '' ? null : Number(e.target.value) })} /></div>
              <div className="field"><label>Enrolled</label>
                <input type="number" min="0" value={off.enrolled ?? ''}
                  onChange={e => setOff({ enrolled: e.target.value })} /></div>
            </div>
            <div className="field"><label>Instructor</label>
              <input list="pgTeachers" value={off.instructor || ''} onChange={e => setOff({ instructor: e.target.value })} />
              <datalist id="pgTeachers">{teacherOptions.map(t => <option key={t} value={t} />)}</datalist></div>
            <div className="field"><label>Days</label>
              <div className="days">
                {DOW.map(d => (
                  <button key={d.n} type="button"
                    className={'daybox' + (off.days.includes(d.n) ? ' on' : '')}
                    onClick={() => toggleDay(d.n)}>{d.l}</button>
                ))}
              </div></div>
            <div className="field"><label>Times</label>
              {times.map((t, i) => (
                <div className="trow" key={i}>
                  <input type="time" value={t.start || ''} onChange={e => setTime(i, { start: e.target.value })} />
                  <span style={{ color: '#6B6455' }}>–</span>
                  <input type="time" value={t.end || ''} onChange={e => setTime(i, { end: e.target.value })} />
                  <button type="button" className="rmtime" title="Remove Time" onClick={() => rmTime(i)}>×</button>
                </div>
              ))}
              <button type="button" className="addtime" onClick={addTime}>+ Add Time</button>
            </div>
          </div>
        )}

        {mode === 'edit' && enrolled.length > 0 && (
          <>
            <div className="sec-h">Enrolled Students ({enrolled.length})</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {enrolled.map((n, i) => (
                <span key={i} style={{
                  background: '#E4EFF3', borderRadius: 6, padding: '4px 10px',
                  fontSize: 12, fontWeight: 500,
                }}>{n}</span>
              ))}
            </div>
          </>
        )}

        <div className="macts">
          {onDelete && <button className="btn-del" onClick={onDelete}>Delete</button>}
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button onClick={save}>Save</button>
        </div>
      </div>
    </div>
  )
}

/* ================= bulk edit ================= */
function BulkModal({ count, locations, categories, onClose, onApply }) {
  const [f, setF] = useState({
    category: '', subject: '', year: '', ageRange: '', platform: '__', locationId: '',
    instructor: '', start: '', end: '', duration: '', sessions: '', period: '__',
    cost: '', costUnit: '__', rate: '', totalHours: '', capacity: '', enrolled: '',
  })
  const [activeOn, setActiveOn] = useState(false)
  const [active, setActive] = useState(true)
  const [daysOn, setDaysOn] = useState(false)
  const [days, setDays] = useState([])
  const set = patch => setF(x => ({ ...x, ...patch }))

  const apply = () => {
    const prog = {}, offp = {}
    const txt = (k, field) => { if (f[k] !== '' && f[k] !== '__') prog[field] = f[k] }
    const numP = (k, field) => { if (f[k] !== '') prog[field] = Number(f[k]) }
    txt('category', 'category'); txt('subject', 'subject'); txt('year', 'year')
    txt('ageRange', 'ageRange'); txt('platform', 'platform')
    txt('period', 'period'); txt('costUnit', 'costUnit')
    if (f.sessions !== '') prog.sessions = f.sessions
    numP('duration', 'duration'); numP('cost', 'cost'); numP('rate', 'rate'); numP('totalHours', 'totalHours')
    if (f.locationId) offp.locationId = f.locationId
    if (f.instructor !== '') offp.instructor = f.instructor
    if (f.capacity !== '') offp.capacity = Number(f.capacity)
    if (f.enrolled !== '') offp.enrolled = f.enrolled
    onApply({ prog, off: offp, time: { start: f.start, end: f.end } },
      daysOn ? days : null, activeOn ? active : null)
  }

  return (
    <div className="pgov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pgmodal" onClick={e => e.stopPropagation()}>
        <h2>Bulk Edit</h2>
        <div className="field" style={{ fontSize: 13, color: '#6B6455' }}>
          Change fields for the {count} selected {count === 1 ? 'row' : 'rows'}. Leave a field blank to keep it as-is.
        </div>
        <div className="frow">
          <div className="field"><label>Category</label>
            <input list="bulkCats" placeholder="— unchanged —" value={f.category}
              onChange={e => set({ category: e.target.value })} />
            <datalist id="bulkCats">{categories.map(c => <option key={c} value={c} />)}</datalist></div>
          <div className="field"><label>Subject</label>
            <input placeholder="— unchanged —" value={f.subject} onChange={e => set({ subject: e.target.value })} /></div>
        </div>
        <div className="frow">
          <div className="field"><label>Year</label>
            <input placeholder="— unchanged —" value={f.year} onChange={e => set({ year: e.target.value })} /></div>
          <div className="field"><label>Grade</label>
            <input placeholder="— unchanged —" value={f.ageRange} onChange={e => set({ ageRange: e.target.value })} /></div>
          <div className="field"><label>Platform</label>
            <select value={f.platform} onChange={e => set({ platform: e.target.value })}>
              <option value="__">— unchanged —</option>
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select></div>
        </div>
        <div className="frow">
          <div className="field"><label>Location</label>
            <select value={f.locationId} onChange={e => set({ locationId: e.target.value })}>
              <option value="">— unchanged —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
          <div className="field"><label>Instructor</label>
            <input placeholder="— unchanged —" value={f.instructor} onChange={e => set({ instructor: e.target.value })} /></div>
        </div>
        <div className="frow">
          <div className="field"><label>Start Time</label>
            <input type="time" value={f.start} onChange={e => set({ start: e.target.value })} /></div>
          <div className="field"><label>End Time</label>
            <input type="time" value={f.end} onChange={e => set({ end: e.target.value })} /></div>
          <div className="field"><label>Duration (Min)</label>
            <input type="number" min="0" placeholder="—" value={f.duration} onChange={e => set({ duration: e.target.value })} /></div>
        </div>
        <div className="frow">
          <div className="field"><label># Of Lessons</label>
            <input placeholder="—" value={f.sessions} onChange={e => set({ sessions: e.target.value })} /></div>
          <div className="field"><label>Per</label>
            <select value={f.period} onChange={e => set({ period: e.target.value })}>
              <option value="__">— unchanged —</option>
              {PERIODS.filter(Boolean).map(p => <option key={p} value={p}>{p}</option>)}
            </select></div>
        </div>
        <div className="frow">
          <div className="field"><label>Cost ($)</label>
            <input type="number" min="0" step="0.01" placeholder="—" value={f.cost} onChange={e => set({ cost: e.target.value })} /></div>
          <div className="field"><label>Cost Per</label>
            <select value={f.costUnit} onChange={e => set({ costUnit: e.target.value })}>
              <option value="__">— unchanged —</option>
              {COST_UNITS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div className="field"><label>Rate ($/Hr)</label>
            <input type="number" min="0" step="0.01" placeholder="—" value={f.rate} onChange={e => set({ rate: e.target.value })} /></div>
        </div>
        <div className="frow">
          <div className="field"><label>Total Hrs</label>
            <input type="number" min="0" step="0.01" placeholder="—" value={f.totalHours} onChange={e => set({ totalHours: e.target.value })} /></div>
          <div className="field"><label>Capacity</label>
            <input type="number" min="0" placeholder="—" value={f.capacity} onChange={e => set({ capacity: e.target.value })} /></div>
          <div className="field"><label>Enrolled</label>
            <input type="number" min="0" placeholder="—" value={f.enrolled} onChange={e => set({ enrolled: e.target.value })} /></div>
        </div>
        <div className="field">
          <label className="bchk"><input type="checkbox" checked={activeOn}
            onChange={e => setActiveOn(e.target.checked)} /><span>Change Active Status</span></label>
          <label className="bchk" style={{ marginTop: 6 }}><input type="checkbox" checked={active}
            onChange={e => setActive(e.target.checked)} /><span>Active</span></label>
        </div>
        <div className="field">
          <label className="bchk"><input type="checkbox" checked={daysOn}
            onChange={e => setDaysOn(e.target.checked)} /><span>Set Days For Selected Rows</span></label>
          <div className="days" style={{ marginTop: 8 }}>
            {DOW.map(d => (
              <button key={d.n} type="button" className={'daybox' + (days.includes(d.n) ? ' on' : '')}
                onClick={() => setDays(v => v.includes(d.n) ? v.filter(x => x !== d.n)
                  : [...v, d.n].sort((a, b) => DOW_ORD[a] - DOW_ORD[b]))}>{d.l}</button>
            ))}
          </div>
        </div>
        <div className="macts">
          <button className="cancel" onClick={onClose}>Cancel</button>
          <button onClick={apply}>Apply To Selected</button>
        </div>
      </div>
    </div>
  )
}

/* ================= managers ================= */
function ManageModal({ kind, onClose, programs, setPrograms, rows, viewState, setViewState }) {
  if (kind === 'loc') return <LocationsManager {...{ onClose, programs, setPrograms, viewState, setViewState }} />
  if (kind === 'cat') return <CatSubjManager {...{ onClose, programs, setPrograms, viewState, setViewState }} />
  if (LIST_KINDS[kind]) return <ListManager {...{ kind, onClose, programs, setPrograms, rows, viewState, setViewState }} />
  return null
}

/* The 16-colour palette, offered as a popover from any colour dot — the
   template never opens the operating system's colour picker. */
function SwatchPop({ x, y, current, onPick, onClose }) {
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={onClose} />
      <div className="cpop" style={{ left: Math.min(x, window.innerWidth - 190), top: y }}>
        {LPAL.map(c => (
          <div key={c} className="sw" style={{
            background: c,
            outline: String(current || '').toLowerCase() === c.toLowerCase() ? '2px solid #2E2516' : undefined,
          }} title={c} onClick={e => { e.stopPropagation(); onPick(c) }} />
        ))}
      </div>
    </>
  )
}

function ColorDot({ color, size = 24, title = 'Click To Change Colour', onPick }) {
  const [pos, setPos] = useState(null)
  return (
    <>
      <button type="button" className="cdot" title={title}
        style={{ width: size, height: size, background: color || DEFAULT_CAT_COLOR }}
        onClick={e => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          setPos({ x: r.left, y: r.bottom + 6 })
        }} />
      {pos && <SwatchPop x={pos.x} y={pos.y} current={color}
        onPick={c => { onPick(c); setPos(null) }} onClose={() => setPos(null)} />}
    </>
  )
}

/* Reorderable rows shared by every manager: grip, colour dot, name, usage
   count, ▲ ▼ and ×. */
function ManagerRow({ sub, draggable, onDragStart, onDragOver, onDragLeave, onDrop, dropTarget, children }) {
  return (
    <div className={'catrow' + (sub ? ' subrow' : '') + (dropTarget ? ' dropt' : '')}
      draggable={draggable}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {children}
    </div>
  )
}

function LocationsManager({ onClose, programs, setPrograms, viewState, setViewState }) {
  const dialog = useDialog()
  const locs = viewState.locations
  const [msg, setMsg] = useState('')
  const [drag, setDrag] = useState(null)
  const [dropId, setDropId] = useState(null)
  const update = (next) => setViewState(vs => ({ ...vs, locations: next.map(l => ({ ...l })) }))

  const add = async () => {
    const name = await dialog.prompt('Add Location', 'Location name')
    if (!name) return
    const id = 'loc_' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (locs.some(l => l.id === id)) { setMsg('A location with that id already exists.'); return }
    setMsg('')
    update([...locs, { id, name: name.trim(), color: LPAL[locs.length % LPAL.length] }])
  }
  const rename = (id, name) => update(locs.map(l => l.id === id ? { ...l, name } : l))
  const recolour = (id, color) => update(locs.map(l => l.id === id ? { ...l, color } : l))
  const move = (id, dir) => {
    const i = locs.findIndex(l => l.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= locs.length) return
    const next = locs.slice()
    next.splice(j, 0, next.splice(i, 1)[0])
    update(next)
  }
  const remove = async (id) => {
    if (locs.length <= 1) { setMsg('You must keep at least one location.'); return }
    const inUse = programs.some(p => (p.offerings || []).some(o => o.locationId === id))
    if (inUse && !await dialog.confirm(
      'This location is used by some offerings. Those offerings will be reassigned to the first remaining location.',
      { title: 'Delete Location', button: 'Delete' })) return
    const fallback = locs.find(l => l.id !== id)?.id
    setPrograms(list => list.map(p => ({
      ...p,
      offerings: (p.offerings || []).map(o => o.locationId === id ? { ...o, locationId: fallback } : o),
    })))
    update(locs.filter(l => l.id !== id))
  }
  const usage = (id) => programs.reduce(
    (n, p) => n + (p.offerings || []).filter(o => o.locationId === id).length, 0)

  const onDrop = (targetId, e) => {
    e.preventDefault()
    setDropId(null)
    if (!drag || drag === targetId) return
    const arr = locs.slice()
    const from = arr.findIndex(l => l.id === drag)
    if (from < 0) return
    const [moved] = arr.splice(from, 1)
    const at = arr.findIndex(l => l.id === targetId)
    const r = e.currentTarget.getBoundingClientRect()
    arr.splice(e.clientY > r.top + r.height / 2 ? at + 1 : at, 0, moved)
    update(arr)
    setDrag(null)
  }

  return (
    <div className="pgov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pgmodal sm" onClick={e => e.stopPropagation()}>
        <h2>Locations</h2>
        <div className="mhint">
          Reorder with ▲ ▼ (or drag), rename by clicking the name, recolour with the dot, or
          remove with ×. Removing a location reassigns its offerings rather than deleting them.
        </div>
        {msg && <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 10 }}>{msg}</div>}
        <div className="mlist">
          {locs.map((l, i) => (
            <ManagerRow key={l.id} draggable dropTarget={dropId === l.id}
              onDragStart={e => { if (e.target.tagName === 'INPUT') { e.preventDefault(); return } setDrag(l.id) }}
              onDragOver={e => { e.preventDefault(); if (drag && drag !== l.id) setDropId(l.id) }}
              onDragLeave={() => setDropId(null)}
              onDrop={e => onDrop(l.id, e)}>
              <span className="grip" title="Drag To Reorder">⠿</span>
              <ColorDot color={l.color} onPick={c => recolour(l.id, c)} />
              <input className="cnm" defaultValue={l.name} title="Rename"
                onBlur={e => { const v = e.target.value.trim(); if (v && v !== l.name) rename(l.id, v); else e.target.value = l.name }}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }} />
              <span className="cuse" title="Offerings at this location">{usage(l.id)}</span>
              <button type="button" className="mv" onClick={() => move(l.id, -1)} disabled={i === 0}>▲</button>
              <button type="button" className="mv" onClick={() => move(l.id, 1)} disabled={i === locs.length - 1}>▼</button>
              <button type="button" className="del2" onClick={() => remove(l.id)} title="Delete">×</button>
            </ManagerRow>
          ))}
        </div>
        <button type="button" className="addtime" onClick={add}>+ Add Location</button>
        <div className="macts"><button onClick={onClose}>Done</button></div>
      </div>
    </div>
  )
}

/* Programs, Platforms, Grades, Times and Days all behave the same way, so they
   share one box driven by LIST_KINDS. */
function ListManager({ kind, onClose, programs, setPrograms, rows, viewState, setViewState }) {
  const dialog = useDialog()
  const K = LIST_KINDS[kind]
  const [drag, setDrag] = useState(null)
  const [dropVal, setDropVal] = useState(null)
  const colours = viewState[K.colours] || {}
  const orderArr = K.order ? (viewState[K.order] || []) : null
  const vals = useMemo(
    () => listOrdered(kind, programs, rows, orderArr),
    [kind, programs, rows, orderArr])

  const setOrder = (next) => { if (K.order) setViewState(vs => ({ ...vs, [K.order]: next })) }
  const recolour = (v, c) => setViewState(vs => ({ ...vs, [K.colours]: { ...(vs[K.colours] || {}), [v]: c } }))

  const move = (v, dir) => {
    if (!K.order) return
    const list = vals.slice()
    const i = list.indexOf(v), j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    list.splice(j, 0, list.splice(i, 1)[0])
    setOrder(list)
  }
  const onDrop = (target, e) => {
    e.preventDefault()
    setDropVal(null)
    if (!K.order || !drag || drag === target) return
    const list = vals.slice()
    const from = list.indexOf(drag)
    if (from < 0) return
    const [moved] = list.splice(from, 1)
    const at = list.indexOf(target)
    const r = e.currentTarget.getBoundingClientRect()
    list.splice(e.clientY > r.top + r.height / 2 ? at + 1 : at, 0, moved)
    setOrder(list)
    setDrag(null)
  }
  const rename = (v, next) => {
    const n = String(next).trim()
    if (!n || n === v) return
    if (K.field) setPrograms(list => list.map(p => ((p[K.field] || '') === v ? { ...p, [K.field]: n } : p)))
    setViewState(vs => {
      const cols = { ...(vs[K.colours] || {}) }
      if (cols[v] !== undefined) { cols[n] = cols[v]; delete cols[v] }
      const out = { ...vs, [K.colours]: cols }
      if (K.order) out[K.order] = (vs[K.order] || []).map(x => (x === v ? n : x))
      return out
    })
  }
  const remove = async (v) => {
    if (K.fixed) return
    if (!await dialog.confirm(
      `Remove "${listLabel(kind, v)}"? Programs keep their other details, they just lose this value.`,
      { title: 'Remove', button: 'Remove' })) return
    if (K.field) setPrograms(list => list.map(p => ((p[K.field] || '') === v ? { ...p, [K.field]: '' } : p)))
    setViewState(vs => (K.order ? { ...vs, [K.order]: (vs[K.order] || []).filter(x => x !== v) } : vs))
  }

  return (
    <div className="pgov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pgmodal sm" onClick={e => e.stopPropagation()}>
        <h2>{K.title}</h2>
        <div className="mhint">
          {K.fixed
            ? 'Recolour the days and see how many entries fall on each. The seven days themselves are fixed.'
            : 'Reorder with ▲ ▼ (or drag), rename by clicking the name, recolour with the dot, or remove with ×. Removing never deletes programs — they just lose that value.'}
        </div>
        <div className="mlist">
          {!vals.length && <div className="mhint" style={{ margin: 0 }}>Nothing to show yet.</div>}
          {vals.map((v, i) => (
            <ManagerRow key={v} draggable={!K.fixed} dropTarget={dropVal === v}
              onDragStart={e => { if (K.fixed) return; if (e.target.tagName === 'INPUT') { e.preventDefault(); return } setDrag(v) }}
              onDragOver={e => { if (K.fixed) return; e.preventDefault(); if (drag && drag !== v) setDropVal(v) }}
              onDragLeave={() => setDropVal(null)}
              onDrop={e => onDrop(v, e)}>
              <span className="grip" title={K.fixed ? '' : 'Drag To Reorder'}
                style={K.fixed ? { visibility: 'hidden' } : undefined}>⠿</span>
              <ColorDot color={colours[v] || DEFAULT_CAT_COLOR} onPick={c => recolour(v, c)} />
              {K.range ? (
                <GradeRange value={v} onCommit={next => rename(v, next)} />
              ) : (K.fixed || K.time) ? (
                <span className="cnm" style={{ padding: '2px 4px' }}>{listLabel(kind, v)}</span>
              ) : (
                <input className="cnm" defaultValue={v} title="Rename"
                  onBlur={e => { const n = e.target.value.trim(); if (n && n !== v) rename(v, n); else e.target.value = v }}
                  onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }} />
              )}
              <span className="cuse" title="Entries using this value">{listUsage(kind, v, programs, rows)}</span>
              <button type="button" className="mv" onClick={() => move(v, -1)} disabled={K.fixed || i === 0}>▲</button>
              <button type="button" className="mv" onClick={() => move(v, 1)} disabled={K.fixed || i === vals.length - 1}>▼</button>
              <button type="button" className="del2" onClick={() => remove(v)} disabled={K.fixed} title="Remove">×</button>
            </ManagerRow>
          ))}
        </div>
        <div className="macts"><button onClick={onClose}>Done</button></div>
      </div>
    </div>
  )
}

/* Grades read as a range, so they are edited as two fields rather than one. */
function GradeRange({ value, onCommit }) {
  const parts = String(value).split(/[–-]/)
  const [from, setFrom] = useState(parts[0] || '')
  const [to, setTo] = useState(parts[1] || '')
  useEffect(() => {
    const p = String(value).split(/[–-]/)
    setFrom(p[0] || ''); setTo(p[1] || '')
  }, [value])
  const commit = () => {
    const f = from.trim(), t = to.trim()
    const next = f && t ? `${f}–${t}` : (f || t)
    if (next && next !== value) onCommit(next)
  }
  const keys = e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }
  return (
    <>
      <input className="cnm gfrom" value={from} title="From"
        onChange={e => setFrom(e.target.value)} onBlur={commit} onKeyDown={keys} />
      <span className="gdash">–</span>
      <input className="cnm gto" value={to} title="To"
        onChange={e => setTo(e.target.value)} onBlur={commit} onKeyDown={keys} />
    </>
  )
}

function CatSubjManager({ onClose, programs, setPrograms, viewState, setViewState }) {
  const [cats, setCats] = useState(viewState.categoryOrder.slice())
  const [subjOrder, setSubjOrder] = useState({ ...viewState.subjOrder })
  const [catColors, setCatColors] = useState({ ...viewState.catColors })
  const [subjColors, setSubjColors] = useState({ ...viewState.subjColors })
  const [msg, setMsg] = useState('')
  useEffect(() => {
    setCats(viewState.categoryOrder.slice())
    setSubjOrder({ ...viewState.subjOrder })
    setCatColors({ ...viewState.catColors })
    setSubjColors({ ...viewState.subjColors })
  }, [viewState])

  const commit = (nextCats, nextSubjOrder, nextCatColors, nextSubjColors) => {
    setCats(nextCats)
    setSubjOrder(nextSubjOrder)
    setCatColors(nextCatColors)
    setSubjColors(nextSubjColors)
    setViewState(vs => ({
      ...vs,
      categoryOrder: nextCats.slice(),
      subjOrder: { ...nextSubjOrder },
      catColors: { ...nextCatColors },
      subjColors: { ...nextSubjColors },
    }))
  }

  const subjectsOf = useCallback((cat) => {
    const ordered = (subjOrder && subjOrder[cat]) || []
    const present = [...new Set(programs.filter(p => p.category === cat).map(p => p.subject).filter(Boolean))]
    return ordered.concat(present.filter(s => !ordered.includes(s)).sort((a, b) => a.localeCompare(b)))
  }, [subjOrder, programs])

  const countCat = useCallback((cat) => programs.filter(p => p.category === cat).length, [programs])
  const countSubj = useCallback((cat, s) => programs.filter(p => p.category === cat && p.subject === s).length, [programs])

  const recolourCat = (cat, color) => commit(cats, subjOrder, { ...catColors, [cat]: color }, subjColors)
  const recolourSubj = (cat, s, color) => commit(cats, subjOrder, catColors, { ...subjColors, [cat + '\u0000' + s]: color })

  const moveCat = (i, dir) => {
    if (i + dir < 0 || i + dir >= cats.length) return
    const next = cats.slice()
    ;[next[i], next[i + dir]] = [next[i + dir], next[i]]
    commit(next, subjOrder, catColors, subjColors)
  }
  /* Move within the list actually on screen, not the stored order — that array
     is empty until someone reorders, so indexing into it moved nothing. */
  const moveSubj = (cat, i, dir) => {
    const arr = subjectsOf(cat).slice()
    const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return
    arr.splice(j, 0, arr.splice(i, 1)[0])
    commit(cats, { ...subjOrder, [cat]: arr }, catColors, subjColors)
  }

  const addCat = async () => {
    const name = await dialog.prompt('Add Category', 'Category name')
    if (!name || !name.trim()) return
    const n = name.trim()
    if (cats.includes(n)) { setMsg('That category already exists.'); return }
    const color = LPAL[Object.keys(catColors).length % LPAL.length]
    commit([...cats, n], subjOrder, { ...catColors, [n]: color }, subjColors)
  }

  const renameCat = (oldName, newName) => {
    const n = newName.trim()
    if (!n || n === oldName) return
    if (cats.includes(n)) { setMsg(`Category "${n}" already exists.`); return }
    setPrograms(list => list.map(p => p.category === oldName ? { ...p, category: n } : p))
    const nextCats = cats.map(c => c === oldName ? n : c)
    const nextColors = { ...catColors, [n]: catColors[oldName] || DEFAULT_CAT_COLOR }
    delete nextColors[oldName]
    const nextSubjOrder = { ...subjOrder }
    if (nextSubjOrder[oldName]) { nextSubjOrder[n] = nextSubjOrder[oldName]; delete nextSubjOrder[oldName] }
    const nextSubjColors = { ...subjColors }
    Object.keys(nextSubjColors).forEach(k => {
      if (k.startsWith(oldName + '\u0000')) {
        nextSubjColors[n + '\u0000' + k.split('\u0000')[1]] = nextSubjColors[k]
        delete nextSubjColors[k]
      }
    })
    commit(nextCats, nextSubjOrder, nextColors, nextSubjColors)
  }

  const renameSubj = (cat, oldName, newName) => {
    const n = newName.trim()
    if (!n || n === oldName) return
    const existing = subjectsOf(cat)
    if (existing.includes(n)) { setMsg(`Subject "${n}" already exists under ${cat}.`); return }
    setPrograms(list => list.map(p => p.category === cat && p.subject === oldName ? { ...p, subject: n } : p))
    const arr = (subjOrder[cat] || []).slice()
    const idx = arr.indexOf(oldName)
    if (idx >= 0) arr[idx] = n
    const nextSubjColors = { ...subjColors }
    const oldKey = cat + '\u0000' + oldName
    const newKey = cat + '\u0000' + n
    if (nextSubjColors[oldKey] !== undefined) {
      nextSubjColors[newKey] = nextSubjColors[oldKey]
      delete nextSubjColors[oldKey]
    }
    commit(cats, { ...subjOrder, [cat]: arr }, catColors, nextSubjColors)
  }

  const deleteCat = (cat) => {
    const n = countCat(cat)
    if (!window.confirm(`Delete category "${cat}"? ${n} program(s) will keep their data but lose this category label.`)) return
    setPrograms(list => list.map(p => p.category === cat ? { ...p, category: '' } : p))
    const nextCats = cats.filter(c => c !== cat)
    const nextColors = { ...catColors }
    delete nextColors[cat]
    const nextSubjOrder = { ...subjOrder }
    delete nextSubjOrder[cat]
    const nextSubjColors = { ...subjColors }
    Object.keys(nextSubjColors).forEach(k => { if (k.startsWith(cat + '\u0000')) delete nextSubjColors[k] })
    commit(nextCats, nextSubjOrder, nextColors, nextSubjColors)
  }

  const deleteSubj = (cat, s) => {
    const n = countSubj(cat, s)
    if (!window.confirm(`Delete subject "${s}" under "${cat}"? ${n} program(s) will keep their data but lose this subject label.`)) return
    setPrograms(list => list.map(p => p.category === cat && p.subject === s ? { ...p, subject: '' } : p))
    const arr = (subjOrder[cat] || []).filter(x => x !== s)
    const nextSubjOrder = { ...subjOrder, [cat]: arr }
    if (!arr.length) delete nextSubjOrder[cat]
    const nextSubjColors = { ...subjColors }
    delete nextSubjColors[cat + '\u0000' + s]
    commit(cats, nextSubjOrder, catColors, nextSubjColors)
  }

  const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', borderBottom: '1px solid #f2efe6' }
  const inputStyle = { flex: 1, padding: '2px 4px', border: '1px solid transparent', borderRadius: 6, fontSize: 13.5, fontWeight: 600, color: 'var(--dark-brown)', background: 'none' }
  const subInputStyle = { ...inputStyle, fontWeight: 400, color: '#6b6455' }
  const btnStyle = { background: 'none', border: 'none', color: '#9a948a', padding: '0 6px', fontSize: 15, cursor: 'pointer' }
  const countStyle = { fontSize: 11, color: 'var(--muted)', fontWeight: 600, minWidth: 18, textAlign: 'center' }

  return (
    <div className="pgov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pgmodal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2>Categories</h2>
        <div style={{ fontSize: 12, color: '#6b6455', marginBottom: 14, lineHeight: 1.4 }}>
          Reorder or delete categories and subjects with ▲ ▼ and × (or drag). Click a name to edit it, or the colour dot to recolour it — for categories and subjects alike. Deleting never removes programs — they just lose that label.
        </div>
        {msg && <div style={{ fontSize: 12, color: '#c0392b', marginBottom: 10 }}>{msg}</div>}
        <div style={{ maxHeight: '60vh', overflow: 'auto', marginBottom: 8 }}>
          {cats.map((cat, ci) => (
            <React.Fragment key={cat}>
              <div style={rowStyle}>
                <span style={{ cursor: 'grab', color: '#9a948a', fontSize: 14 }}>☰</span>
                <input type="color" value={catColors[cat] || DEFAULT_CAT_COLOR}
                  onChange={e => recolourCat(cat, e.target.value)}
                  style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px #d8d3c6', padding: 0 }} />
                <input defaultValue={cat}
                  onBlur={e => { if (e.target.value !== cat) renameCat(cat, e.target.value) }}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  style={inputStyle} />
                <span style={countStyle}>{countCat(cat)}</span>
                <button type="button" style={btnStyle} onClick={() => moveCat(ci, -1)} disabled={ci === 0}>▲</button>
                <button type="button" style={btnStyle} onClick={() => moveCat(ci, 1)} disabled={ci === cats.length - 1}>▼</button>
                <button type="button" className="rmtime" onClick={() => deleteCat(cat)} title="Delete">×</button>
              </div>
              {subjectsOf(cat).map((s, si) => (
                <div key={cat + '|' + s} style={{ ...rowStyle, paddingLeft: 34 }}>
                  <span style={{ cursor: 'grab', color: '#9a948a', fontSize: 14 }}>☰</span>
                  <input type="color" value={subjColors[cat + '\u0000' + s] || DEFAULT_CAT_COLOR}
                    onChange={e => recolourSubj(cat, s, e.target.value)}
                    style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px #d8d3c6', padding: 0 }} />
                  <input defaultValue={s}
                    onBlur={e => { if (e.target.value !== s) renameSubj(cat, s, e.target.value) }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    style={subInputStyle} />
                  <span style={countStyle}>{countSubj(cat, s)}</span>
                  <button type="button" style={btnStyle} onClick={() => moveSubj(cat, si, -1)} disabled={si === 0}>▲</button>
                  <button type="button" style={btnStyle} onClick={() => moveSubj(cat, si, 1)} disabled={si === subjectsOf(cat).length - 1}>▼</button>
                  <button type="button" className="rmtime" onClick={() => deleteSubj(cat, s)} title="Delete">×</button>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <button type="button" className="addtime" onClick={addCat}>+ Add Category</button>
        <div className="macts">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

/* ================= settings (backups) ================= */
function SettingsModal({ onClose, setPrograms }) {
  const [backups, setBackups] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/programs/backups`, { headers: HEADERS })
      if (r.ok) setBackups(await r.json())
    } catch { /* offline is fine */ }
  }, [])
  useEffect(() => { load() }, [load])

  const backUp = async () => {
    setBusy(true); setMsg('')
    try {
      const label = new Date().toLocaleString(undefined,
        { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      const r = await fetch(`${API_BASE}/api/programs/backup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...HEADERS },
        body: JSON.stringify({ label }),
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      setMsg('Backed up.')
      load()
    } catch (e) { setMsg('Backup failed: ' + e.message) }
    finally { setBusy(false) }
  }
  const restore = async (id) => {
    if (!window.confirm('Restore this backup? Current programs will be replaced.')) return
    setBusy(true); setMsg('')
    try {
      const r = await fetch(`${API_BASE}/api/programs/restore/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...HEADERS },
      })
      if (!r.ok) throw new Error('HTTP ' + r.status)
      const data = await r.json()
      if (Array.isArray(data)) setPrograms(() => data)
      setMsg('Restored.')
    } catch (e) { setMsg('Restore failed: ' + e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="pgov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pgmodal sm" onClick={e => e.stopPropagation()}>
        <h2>Settings</h2>
        <div className="sblock">
          <div className="slab">Back Up Now</div>
          <div className="sdesc">Writes a snapshot of every program to the database. Up to 14 are kept.</div>
          <button disabled={busy} onClick={backUp}>Back Up Now</button>
        </div>
        <div className="sblock">
          <div className="slab">Restore From Backup</div>
          <div className="sdesc">Replace the current programs with an earlier snapshot.</div>
          {backups === null && <div className="sdesc">Loading…</div>}
          {backups && !backups.length && <div className="sdesc">No backups yet.</div>}
          {backups && backups.map(b => (
            <div className="brow" key={b.id}>
              <span>{b.label || new Date(b.created).toLocaleString()}</span>
              <button disabled={busy} onClick={() => restore(b.id)}>Restore</button>
            </div>
          ))}
        </div>
        {msg && <div style={{
          fontSize: 12, marginTop: 8,
          color: /failed/i.test(msg) ? '#c0392b' : '#20bab5',
        }}>{msg}</div>}
        <div className="macts">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
