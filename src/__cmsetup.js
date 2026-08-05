// Two Mondays so the register has week columns, and one program tab.
const MONDAYS = ['2026-09-07','2026-09-14','2026-09-21']
const o = window.fetch
window.fetch = (u, x) => {
  const s = String(u)
  if (s.includes('/api/comments')) return Promise.resolve({ ok:true, json:()=>Promise.resolve({}) })
  if (s.includes('/api/calendar')) return Promise.resolve({ ok:true, json:()=>Promise.resolve({
    calendars:[{ id:'c1', name:'Afterschool' }],
    events: MONDAYS.map((d,i)=>({ id:'e'+i, calendarId:'c1', start:d, title:'Week '+(i+1) })),
  }) })
  if (s.includes('/api/')) return Promise.resolve({ ok:true, json:()=>Promise.resolve({ok:true}) })
  return o(u,x)
}
