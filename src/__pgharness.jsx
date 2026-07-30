// TEMPORARY harness entry. Delete with the harness.
import { createRoot } from 'react-dom/client'
import Programs from './pages/Programs.jsx'
import './index.css'
createRoot(document.getElementById('root')).render(
  <div style={{ padding: 20, maxWidth: 1800, margin: '0 auto', background: '#F4F7F8', minHeight: '100vh' }}>
    <Programs /></div>)
