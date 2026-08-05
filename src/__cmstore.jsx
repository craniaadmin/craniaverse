import { useState, useEffect, useCallback } from 'react'
const rec = (id, first, last, program) => ({
  id, createdAt:'2026-06-01T09:00:00Z', displayName:first+' '+last,
  student:{ firstName:first, lastName:last, grade:'5', notes:[] },
  customer:{ student:{}, guardian1:{'First Name':'Amara','Last Name':'Okafor'}, guardian2:{}, emergency:{}, meta:{} },
  programs:[{ program, active:true, status:'Active', year:'26_27', rate:'$199',
    schedule:'Mon 4:30 pm', fees:{} }],
})
let STATE = [
  rec('1','Zara','Okafor','FLEX MATH - SINGLE'),
  rec('2','Kofi','Okafor','FLEX MATH - SINGLE'),
]
const PROGRAMS = [{ id:'p1', name:'FLEX MATH - SINGLE', category:'FLEX',
  offerings:[{ id:'o1', locationId:'loc1', days:[1], capacity:7, times:[{start:'16:30',end:'17:25'}] }] }]
const L=new Set(); const notify=()=>L.forEach(l=>l())
export function useStore(){
  const [,bump]=useState(0)
  useEffect(()=>{const l=()=>bump(n=>n+1);L.add(l);return ()=>L.delete(l)},[])
  return { records:STATE, programs:PROGRAMS, programsState:{}, status:'online',
    select:()=>{}, refresh:async()=>{notify()},
    updateCustomerField:useCallback(()=>{},[]), updateStudentField:useCallback(()=>{},[]) }
}
