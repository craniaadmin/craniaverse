import { createRoot } from 'react-dom/client'
import ClassLists from './pages/ClassLists.jsx'
import './index.css'
createRoot(document.getElementById('root')).render(
  <div style={{ padding: 20, background: '#F4F7F8', minHeight: '100vh' }}><ClassLists /></div>)
