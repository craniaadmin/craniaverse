import './__lgsetup.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Logins from './pages/Logins.jsx'
class B extends React.Component {
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return {err:e}}
  render(){ return this.state.err ? <pre id="harness-error">{String(this.state.err.stack)}</pre> : this.props.children }
}
createRoot(document.getElementById('root')).render(
  <div style={{display:'flex',background:'#F4F7F8',minHeight:'100vh'}}>
    <div style={{width:232,flex:'none',background:'#2E2516'}} />
    <div style={{flex:1,minWidth:0}}><Logins onNavigate={()=>{}} /></div>
  </div>)
