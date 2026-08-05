import './__cmsetup.js'
import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Comments from './pages/Comments.jsx'
class B extends React.Component {
  constructor(p){super(p);this.state={err:null}}
  static getDerivedStateFromError(e){return {err:e}}
  render(){ return this.state.err ? <pre id="harness-error">{String(this.state.err.stack)}</pre> : this.props.children }
}
createRoot(document.getElementById('root')).render(
  <div style={{background:'#F4F7F8',minHeight:'100vh'}}><B><Comments onNavigate={()=>{}} /></B></div>)
