import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import TopNav from './components/TopNav'
import { ACCOUNT_CSS } from './components/AccountMenu'

const user = { id:'u1', email:'info@crania-schools.com', name:'Ada Admin', role:'admin', initials:'AA' }

createRoot(document.getElementById('root')).render(
  <div style={{ background:'#F4F7F8', minHeight:'100vh' }}>
    <style>{ACCOUNT_CSS}</style>
    <TopNav section="home" sub="Projects" onSubSelect={()=>{}} onLogout={()=>{}} user={user} />
    <div style={{ padding:24 }}>
      <div id="probe" style={{ background:'#2E2516', padding:20, display:'inline-block', marginTop:20 }}>
        <div className="brandwrap" style={{ background:'#fff', borderRadius:8, padding:'4px 10px',
             display:'inline-flex', alignItems:'center', maxHeight:34 }}>
          <img src={new URL('./assets/crania-logo.png', import.meta.url).href}
               className="brand-logo" style={{ height:22, borderRadius:10 }} />
        </div>
      </div>
    </div>
  </div>
)
