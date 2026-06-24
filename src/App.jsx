import { useState } from 'react'
import TopNav from './components/TopNav'
import Login from './components/Login'
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
import Placeholder from './pages/Placeholder'
import { StoreProvider } from './data/store'

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [page, setPage] = useState('Dashboard')

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
      default: return <Placeholder title={page} />
    }
  }

  return (
    <StoreProvider>
      <div className="app">
        <TopNav current={page} onNavigate={setPage} onLogout={() => setAuthed(false)} />
        {render()}
      </div>
    </StoreProvider>
  )
}
