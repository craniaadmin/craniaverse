import { useState, useEffect, useCallback } from 'react'
const G=(f,l,e)=>({'First Name':f,'Last Name':l,...(e?{Email:e}:{})})
const prog=(name,status)=>({program:name,active:status==='Active',status,year:'26_27',rate:'$199',fees:{}})
const rec=(id,first,last,g1,progs,meta)=>({
  id, createdAt:'2026-06-01T09:00:00Z', displayName:first+' '+last,
  student:{firstName:first,lastName:last,grade:'5',school:'Elmwood PS',medical:'',notes:[],craniaCash:0},
  customer:{student:{},guardian1:g1,guardian2:{},emergency:{},meta:meta||{}},
  programs:progs })
let STATE=[
  // already numbered — must never be renumbered
  rec('1','Zara','Okafor',G('Amara','Okafor','amara@x.test'),
      [prog('FLEX MATH - SINGLE','Active'),prog('Private Piano — 30 min','Active')],{studentId:'S0007'}),
  // no number yet — must be issued above the highest
  rec('2','Kofi','Okafor',G('Amara','Okafor','amara@x.test'),[prog('MATH ENRICHMENT - LEVEL 2','Active')],{}),
  rec('3','Aditi','Sharma',G('Priya','Sharma','priya@x.test'),[prog('Summer Camp — Full Day','New')],{}),
]
const PROGRAMS=[
  {id:'p1',name:'FLEX MATH - SINGLE',category:'FLEX'},
  {id:'p2',name:'MATH ENRICHMENT - LEVEL 2',category:'ENRICHMENT'},
]
let PSTATE={categoryOrder:['ENRICHMENT','FLEX','PRIVATE PIANO LESSONS','SUMMER CAMP'],
  catColors:{ENRICHMENT:'#F1F3F4',FLEX:'#F1F3F4','PRIVATE PIANO LESSONS':'#F1F3F4','SUMMER CAMP':'#F1F3F4'}}
const L=new Set(); const notify=()=>L.forEach(l=>l()); const setState=f=>{STATE=f(STATE);notify()}
window.__st={get records(){return STATE}}
export function useStore(){
  const [,bump]=useState(0)
  useEffect(()=>{const l=()=>bump(n=>n+1);L.add(l);return ()=>L.delete(l)},[])
  return { records:STATE, programs:PROGRAMS, programsState:PSTATE, rules:[],
    setProgramsState:useCallback(u=>{PSTATE=typeof u==='function'?u(PSTATE):u;notify()},[]),
    status:'online', select:()=>{}, refresh:async()=>{notify()},
    addCashEntry:useCallback(()=>{},[]),
    updateCustomerField:useCallback((id,sec,k,v)=>setState(rs=>rs.map(r=>r.id===id
      ?{...r,customer:{...r.customer,[sec]:{...r.customer[sec],[k]:v}}}:r)),[]),
    updateStudentField:useCallback(()=>{},[]),
    addRegistration:async(form)=>{const id='new-'+Date.now()
      setState(rs=>[...rs,rec(id,form.studentFirstName,form.studentLastName,G('Amara','Okafor','amara@x.test'),[],{})])
      return id},
    deleteRegistration:async id=>setState(rs=>rs.filter(r=>r.id!==id)) }
}
