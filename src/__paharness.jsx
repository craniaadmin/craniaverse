import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PageActions, { PAGEACTIONS_CSS } from './components/PageActions'
window.fetch = async () => ({ ok:true, status:200, json: async () => [] })
createRoot(document.getElementById('root')).render(
  <div className="page" style={{background:'#F4F7F8',minHeight:'100vh'}}>
    <style>{PAGEACTIONS_CSS}</style>
    <PageActions
      onUndo={()=>{}} onRedo={()=>{}} undoLabel="a change" redoLabel=""
      csvName="demo" csvColumns={[{key:'a',label:'A'}]} csvRows={[{a:1}]}
      backupCollection="registrations"
      settingsExtra={<button onClick={()=>{}}>Save the year as an image</button>}
    >
      <button title="Choose which columns are shown">Columns</button>
    </PageActions>
  </div>)
