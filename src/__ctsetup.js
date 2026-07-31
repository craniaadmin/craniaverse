// TEMPORARY harness shim. Delete with the harness.
window.__ctPut = []
const origFetch = window.fetch
window.__ctSeed = {
  extras: {}, hidden: [], hiddenCols: {}, colOrder: [],
  manual: [
    { id: 'manual-real', org: 'ZZZ Manual Org', contest: 'A Manual Contest', regDeadline: '', contestDate: '2027-05-01', numOrdered: '3', status: 'Cancelled' },
    { id: 'manual-b1', org: '', contest: '', regDeadline: '', contestDate: '', numOrdered: '', status: 'Waiting' },
  ],
}
window.fetch = (url, opts) => {
  if (String(url).includes('/api/contests')) {
    if (opts && opts.method === 'PUT') { window.__ctPut.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) }) }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(window.__ctSeed) })
  }
  return origFetch(url, opts)
}
