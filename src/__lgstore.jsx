import { useState, useEffect, useCallback } from 'react'
const rec = (id, first, last, grade, sid, email, extra={}) => ({
  id, createdAt:'2026-06-01T09:00:00Z', displayName:first+' '+last,
  student:{ firstName:first, lastName:last, grade, email, notes:[], ...extra },
  customer:{ student:{}, guardian1:{}, guardian2:{}, emergency:{}, meta:{ studentId:sid } },
  programs:[], cashLog:[],
})
let STATE = [
  rec('1','Zara','Okafor','4','S0001','zara@x.test'),
  // an override already in place
  rec('2','Kofi','Okafor','2','S0002','kofi@x.test',{ loginPassword:'Sunflower42' }),
  // two students with the SAME name -> colliding generated usernames
  rec('3','Sam','Lee','7','S0003','sam1@x.test'),
  rec('4','Sam','Lee','5','S0004','sam2@x.test'),
  // no last name -> no login can be generated
  rec('5','Noah','','3','S0005',''),
]
const L=new Set(); const notify=()=>L.forEach(l=>l())
const setState=f=>{STATE=f(STATE);notify()}
window.__lg = { get records(){ return STATE } }
export function useStore(){
  const [,bump]=useState(0)
  useEffect(()=>{const l=()=>bump(n=>n+1);L.add(l);return ()=>L.delete(l)},[])
  return { records:STATE, rules:[], programs:[], programsState:{}, status:'online',
    select:()=>{}, refresh:async()=>{notify()},
    updateStudentField: useCallback((id,k,v)=>setState(rs=>rs.map(r=>r.id===id
      ? { ...r, student:{...r.student,[k]:v} } : r)),[]),
    updateCustomerField:useCallback(()=>{},[]) }
}
