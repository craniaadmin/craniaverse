import { buildFamilyIndex } from './src/data/family.js'
const rec = (id, g1, g2 = {}, famId) => ({
  id, student: { firstName: id }, customer: { guardian1: g1, guardian2: g2, meta: famId ? { familyId: famId } : {} },
})
const G = (f, l, e) => ({ 'First Name': f, 'Last Name': l, ...(e ? { Email: e } : {}) })

const groups = (recs) => {
  const idx = buildFamilyIndex(recs)
  const m = new Map()
  for (const r of recs) { const k = idx.get(r.id); if (!m.has(k)) m.set(k, []); m.get(k).push(r.id) }
  return [...m.values()].map(g => g.sort().join('+')).sort()
}
const check = (name, recs, expect) => {
  const got = groups(recs).join(' | ')
  console.log((got === expect ? 'PASS  ' : 'FAIL  ') + name)
  if (got !== expect) console.log('        expected: ' + expect + '\n        got     : ' + got)
}

// THE REPORTED BUG: same parents, one record has the email, the other doesn't
check('one has guardian email, other does not',
  [rec('one', G('Ada','Test','ada@x.com')), rec('two', G('Ada','Test'))], 'one+two')

check('identical name and email', [rec('a', G('Ada','Test','ada@x.com')), rec('b', G('Ada','Test','ada@x.com'))], 'a+b')
check('case and spacing differ',
  [rec('a', G('Ada','Test','Ada@X.com')), rec('b', G(' ada ','  test ','ada@x.com'))], 'a+b')
check('same name, DIFFERENT emails -> stay apart',
  [rec('a', G('John','Smith','j1@x.com')), rec('b', G('John','Smith','j2@x.com'))], 'a | b')
check('parent in guardian2 slot on one record',
  [rec('a', G('Ada','Test','ada@x.com')), rec('b', {}, G('Ada','Test','ada@x.com'))], 'a+b')
check('transitive: A~B by email, B~C by name',
  [rec('a', G('Ada','Test','ada@x.com')), rec('b', G('Ada','Test','ada@x.com')), rec('c', G('Ada','Test'))], 'a+b+c')
check('explicit family id forces a join',
  [rec('a', G('Ada','Test','ada@x.com'), {}, 'F0001'), rec('b', G('Zed','Other','z@x.com'), {}, 'F0001')], 'a+b')
check('blank records stay separate', [rec('a', {}), rec('b', {})], 'a | b')
check('unrelated families stay apart',
  [rec('a', G('Ada','Test','ada@x.com')), rec('b', G('Bob','Other','bob@x.com'))], 'a | b')
check('shared email, different names -> joined',
  [rec('a', G('Ada','Test','home@x.com')), rec('b', G('Ben','Test','home@x.com'))], 'a+b')
