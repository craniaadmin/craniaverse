// Temporary preview harness — renders the Programs page against the seed JSON so its
// layout can be checked without signing in. Delete this file and pgpreview.html.
import { createRoot } from 'react-dom/client'
import Programs from './pages/Programs.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <div style={{ padding: '20px', maxWidth: 1800, margin: '0 auto', background: '#F4F7F8', minHeight: '100vh' }}>
    <Programs />
  </div>,
)
