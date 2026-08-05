import { awardsForRow, rowKeyOf, fieldCanTrigger } from './src/data/autoCash.js'

const RULES = [
  { id:'present',  reason:'Present',  delta:1,  when:{ field:'attendance', value:'P' } },
  { id:'no-shirt', reason:'No Shirt', delta:-5, when:{ field:'uniform', value:'No' } },
  { id:'late',     reason:'Late',     delta:-1, when:{ field:'attendance', value:'L' } },
  { id:'manual',   reason:'Contest winner', delta:20, when:null },
]

// A faithful stand-in for the server route, so the reconcile rules are
// exercised exactly as written there.
function reconcile(state, key, awards) {
  const want = new Map(awards.map(a => [a.ruleId, a]))
  const kept = [], have = new Set()
  for (const e of state.log) {
    if (!(e.auto && e.auto.key === key)) { kept.push(e); continue }
    const t = want.get(e.auto.ruleId)
    if (t && t.delta === e.delta) { kept.push(e); have.add(e.auto.ruleId) }
  }
  const added = [...want].filter(([id]) => !have.has(id))
    .map(([ruleId,a]) => ({ delta:a.delta, reason:a.reason, auto:{ key, ruleId } }))
  const next = [...kept, ...added]
  const before = state.log.reduce((n,e)=>n+e.delta,0)
  const after  = next.reduce((n,e)=>n+e.delta,0)
  return { log: next, balance: state.balance + (after - before) }
}

let fails = 0
const check = (label, got, want) => {
  const ok = got === want; if(!ok) fails++
  console.log((ok?'PASS  ':'FAIL  ')+label+(ok?'':`  expected ${want}, got ${got}`))
}

const KEY = rowKeyOf('26_27|FLEX MATH', { lessonNo: 3 }, 2)
let s = { log: [{ delta: 20, reason:'Contest winner' }], balance: 20 }   // a manual entry

// mark Present
s = reconcile(s, KEY, awardsForRow(RULES, { attendance:'P' }))
check('marking P awards once', s.balance, 21)

// mark Present AGAIN (re-select same value / another edit on the row)
s = reconcile(s, KEY, awardsForRow(RULES, { attendance:'P' }))
check('re-marking P does not award twice', s.balance, 21)

// correct it to Absent
s = reconcile(s, KEY, awardsForRow(RULES, { attendance:'A' }))
check('correcting P to A takes the point back', s.balance, 20)

// P -> A -> P (the old double-award path)
s = reconcile(s, KEY, awardsForRow(RULES, { attendance:'P' }))
check('P then A then P is still just +1', s.balance, 21)

// uniform No on the same lesson, stacking with attendance
s = reconcile(s, KEY, awardsForRow(RULES, { attendance:'P', uniform:'No' }))
check('two rules on one lesson both apply', s.balance, 16)
s = reconcile(s, KEY, awardsForRow(RULES, { attendance:'P', uniform:'Yes' }))
check('fixing the uniform mark refunds only that rule', s.balance, 21)

// Late now has its own rule — impossible before
s = reconcile(s, KEY, awardsForRow(RULES, { attendance:'L' }))
check('a rule on Late fires (was impossible)', s.balance, 19)

// the manual entry is never touched
check('manual entry survives every reconcile',
  s.log.filter(e=>!e.auto).length, 1)

// a second lesson is independent
const KEY2 = rowKeyOf('26_27|FLEX MATH', { lessonNo: 4 }, 3)
s = reconcile(s, KEY2, awardsForRow(RULES, { attendance:'P' }))
check('a different lesson awards separately', s.balance, 20)

// deleting the rule stops the award (no hardcoded fallback)
check('no rules means no awards', awardsForRow([], { attendance:'P' }).length, 0)
check('manual-only rule never auto-fires',
  awardsForRow([RULES[3]], { attendance:'P' }).length, 0)
check('non-triggering field is skipped', fieldCanTrigger(RULES,'performance'), false)
check('triggering field is watched', fieldCanTrigger(RULES,'attendance'), true)

console.log(fails ? `\n${fails} FAILED` : '\nall passed')
