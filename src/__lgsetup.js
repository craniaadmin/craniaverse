window.__err = [];
window.addEventListener('error', e => { window.__err.push(String(e.message) + " @ " + (e.filename||"") + ":" + e.lineno) });
window.addEventListener('unhandledrejection', e => { window.__err.push("rejection: " + String(e.reason && e.reason.message || e.reason)) });
window.__puts = []
const o = window.fetch
window.fetch = (u,x) => {
  const s=String(u)
  if (x && x.method === 'PUT') window.__puts.push({ url:s, body:x.body })
  if (s.includes('/api/customers/backups')) return Promise.resolve({ ok:true, json:()=>Promise.resolve([]) })
  if (s.includes('/api/')) return Promise.resolve({ ok:true, json:()=>Promise.resolve({ok:true}) })
  return o(u,x)
}
