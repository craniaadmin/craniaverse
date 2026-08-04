import fs from 'fs'
const src = fs.readFileSync('src/pages/Customers.jsx','utf8')
// pull the two helpers straight out of the page so this tests the real code
const grab = (name, end) => src.slice(src.indexOf(name), src.indexOf(end))
const code = grab("const TINTS =", "const CPREF_KEY") + '\nexport { TINTS, autoTint, tintFor, DEFAULT_CAT_COLOR }'
fs.writeFileSync('tint-tmp.mjs', "const DEFAULT_CAT_COLOR = '#F1F3F4'\n" + code)
const { tintFor } = await import('./tint-tmp.mjs')

const data = JSON.parse(fs.readFileSync('src/data/programsData.json','utf8'))
const catColors = data.catColors           // every one of these is #F1F3F4
const cats = Object.keys(catColors)
console.log('stored colours are all identical:', new Set(Object.values(catColors)).size === 1)
console.log()
const seen = new Map()
for (const c of cats) {
  const t = tintFor(c, catColors)
  console.log('  ' + c.padEnd(24) + t)
  seen.set(t, [...(seen.get(t)||[]), c])
}
const clashes = [...seen.values()].filter(g => g.length > 1)
console.log('\ndistinct colours:', seen.size, 'of', cats.length)
console.log('clashes:', clashes.length ? JSON.stringify(clashes) : 'none')
console.log('\nFLEX vs ENRICHMENT differ:', tintFor('FLEX',catColors) !== tintFor('ENRICHMENT',catColors))
console.log('an explicit choice still wins:', tintFor('FLEX', { FLEX: '#5FA09E' }) === '#5FA09E')
console.log('stable across calls:', tintFor('FLEX',catColors) === tintFor('FLEX',catColors))
fs.unlinkSync('tint-tmp.mjs')
