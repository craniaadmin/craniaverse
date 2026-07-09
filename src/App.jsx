import { useState, useEffect } from 'react'
import TopNav from './components/TopNav'
import Login from './components/Login'

const API_BASE = import.meta.env?.VITE_API_URL || ''
import Dashboard from './pages/Dashboard'
import ToDo from './pages/ToDo'
import CalendarView from './pages/CalendarView'
import Schedules from './pages/Schedules'
import Customers from './pages/Customers'
import Students from './pages/Students'
import Programs from './pages/Programs'
import FeeSchedule from './pages/FeeSchedule'
import Surveys from './pages/Surveys'
import CraniaCash from './pages/CraniaCash'
import Inventory from './pages/Inventory'
import Contests from './pages/Contests'
import StaffHub from './pages/StaffHub'
import StaffInformation from './pages/StaffInformation'
import Payroll from './pages/Payroll'
import Forms from './pages/Forms'
import Placeholder from './pages/Placeholder'
import { StoreProvider } from './data/store'

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [page, setPage] = useState('Dashboard')

  // On mount, ask the server whether an existing session cookie is
  // still valid. If yes, skip the login screen; if no, show it.
  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: 'include' })
      .then(r => setAuthed(r.ok))
      .catch(() => setAuthed(false))
      .finally(() => setCheckingAuth(false))
  }, [])

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' })
    } catch (err) { console.error(err) }
    setAuthed(false)
  }

  if (checkingAuth) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#5a6470' }}>
        Loading…
      </div>
    )
  }
  if (!authed) return <Login onSignIn={() => { setAuthed(true); setPage('Dashboard') }} />

  const render = () => {
    switch (page) {
      case 'Dashboard': return <Dashboard onNavigate={setPage} />
      case 'To Do': return <ToDo />
      case 'Calendar': return <CalendarView />
      case 'Schedules': return <Schedules />
      case 'Customers': return <Customers onNavigate={setPage} />
      case 'Students': return <Students onNavigate={setPage} />
      case 'Programs': return <Programs />
      case 'Fee Schedules': return <FeeSchedule />
      case 'Surveys': return <Surveys />
      case 'Crania Cash': return <CraniaCash />
      case 'Inventory': return <Inventory />
      case 'Contests': return <Contests onNavigate={setPage} />
      case 'Staff Hub': return <StaffHub />
      case 'Staff Information': return <StaffInformation />
      case 'Payroll': return <Payroll />
      case 'Forms': return <Forms />
      default: return <Placeholder title={page} />
    }
  }

  return (
    <StoreProvider>
      <div className="app">
        <TopNav current={page} onNavigate={setPage} onLogout={logout} />
        {render()}
      </div>
    </StoreProvider>
  )
}
