import { useState, useEffect, useCallback, useMemo } from 'react'
import TopNav from './components/TopNav'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import SessionTimer, { SESSION_CSS } from './components/SessionTimer'
import { ACCOUNT_CSS } from './components/AccountMenu'
import { SUBMENUS } from './data/mockData'

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
import ClassLists from './pages/ClassLists'
import EmergencyContacts from './pages/EmergencyContacts'
import Attendance from './pages/Attendance'
import Comments from './pages/Comments'
import Logins from './pages/Logins'
import MarketingCalendar from './pages/MarketingCalendar'
import Marketing from './pages/Marketing'
import Leads from './pages/Leads'
import Contacts from './pages/Contacts'
import StaffInformation from './pages/StaffInformation'
import Forms from './pages/Forms'
import Registrations from './pages/Registrations'
import Invoices from './pages/Invoices'
import Receipts from './pages/Receipts'
import Projects from './pages/Projects'
import ITAccounts from './pages/ITAccounts'
import CraniaStore from './pages/CraniaStore'
import Placeholder from './pages/Placeholder'
import { StoreProvider } from './data/store'

// Route table for the v7 layout. Key = `${section}:${sub}`. Missing
// entries fall through to <Placeholder />.
//
// NOTE: Accounting, Payments, Payroll and Staff Hub pages exist in
// src/pages/ but the client's v7 mockup omits them from the nav.
// They are intentionally not wired here — restore by adding a route
// key and importing the component if she asks for them back.
const ROUTES = {
  'home:Dashboard':          (nav) => <Dashboard onNavigate={nav} />,
  'home:Calendar':           () => <CalendarView />,
  'home:To-Do':              (nav) => <ToDo initialView="todo" onNavigate={nav} />,
  'home:Checklists':         (nav) => <ToDo initialView="checklists" onNavigate={nav} />,
  'home:Projects':           () => <Projects />,

  'programs:Programs':       (nav, recId, clearRecId) =>
    <Programs initialProgramId={recId} onConsumeInitialProgram={clearRecId} />,
  'programs:Class Lists':    (nav) => <ClassLists onNavigate={nav} />,
  'programs:Contests':       (nav) => <Contests onNavigate={nav} />,

  'customers:Customers':     (nav, recId, clearRecId) =>
    <Customers onNavigate={nav} initialRecordId={recId} onConsumeInitialRecord={clearRecId} />,
  'customers:Emergency Contacts': (nav) => <EmergencyContacts onNavigate={nav} />,

  'students:Students':       (nav, recId, clearRecId) =>
    <Students onNavigate={nav} initialRecordId={recId} onConsumeInitialRecord={clearRecId} />,
  'students:Attendance':     (nav) => <Attendance onNavigate={nav} />,
  'students:Comments':       (nav) => <Comments onNavigate={nav} />,
  'students:Crania Cash':    (nav) => <CraniaCash onNavigate={nav} />,
  'students:Logins':         (nav) => <Logins onNavigate={nav} />,

  'staff:Staff':             () => <StaffInformation />,
  'staff:Schedules':         () => <Schedules />,

  'operations:Inventory':    () => <Inventory />,
  'operations:Crania Store': () => <CraniaStore />,
  'operations:IT Accounts':  () => <ITAccounts />,

  'financial:Tuition Schedules': () => <FeeSchedule />,
  'financial:Invoices':      () => <Invoices />,
  'financial:Receipts':      () => <Receipts />,

  'marketing:Marketing':     () => <Marketing />,
  'marketing:Leads':         (nav) => <Leads onNavigate={nav} />,
  'marketing:Surveys':       () => <Surveys />,
  'marketing:Calendar':      () => <MarketingCalendar />,

  'contacts:Contacts':       () => <Contacts />,

  'forms:All Forms':         (nav) => <Forms onNavigate={nav} />,
  'forms:Registrations':     (nav) => <Registrations onNavigate={nav} />,
  'forms:Submissions':       (nav) => <Forms onNavigate={nav} initialView="submissions" />,
  'forms:Templates':         (nav) => <Forms onNavigate={nav} initialView="templates" />,
  'forms:Form Builder':      (nav) => <Forms onNavigate={nav} initialView="new" />,
}

// Reverse lookup: given a legacy page label (e.g. "To Do", "Fee
// Schedules", "Staff Information"), find the (section, sub) tuple
// so old Dashboard `onNavigate('To Do')` calls still work.
const LEGACY_ALIAS = {
  'To Do':              ['home',     'To-Do'],
  'Fee Schedules':      ['financial','Tuition Schedules'],
  'Staff Information':  ['staff',    'Staff'],
}

function resolveNav(target) {
  // target can be either a bare sub label or [section, sub].
  if (Array.isArray(target)) return target
  if (LEGACY_ALIAS[target]) return LEGACY_ALIAS[target]
  // Otherwise look for the first section whose SUBMENUS contains it.
  for (const [section, subs] of Object.entries(SUBMENUS)) {
    if (subs.includes(target)) return [section, target]
  }
  return ['home', 'Dashboard']
}

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [user, setUser] = useState(null)
  const [expiresAt, setExpiresAt] = useState(0)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [section, setSection] = useState('home')
  const [sub, setSub] = useState('Dashboard')
  // Set alongside a navigate() call that targets a specific record (e.g.
  // "open this student" from Emergency Contacts). Consumed once by the
  // destination page's initialRecordId effect, then cleared — so a plain
  // sidebar click back into the same page later doesn't reopen it.
  const [pendingRecordId, setPendingRecordId] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/me`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) { setAuthed(false); return }
        const body = await r.json().catch(() => ({}))
        setAuthed(true)
        setUser(body.user || null)
        setExpiresAt(body.expiresAt || 0)
      })
      .catch(() => setAuthed(false))
      .finally(() => setCheckingAuth(false))
  }, [])

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' })
    } catch (err) { console.error(err) }
    setAuthed(false); setUser(null); setExpiresAt(0)
  }

  // Clicking a sidebar section jumps to that section's first submenu.
  const selectSection = useCallback((sectionId) => {
    setSection(sectionId)
    const first = (SUBMENUS[sectionId] || [])[0]
    if (first) setSub(first)
  }, [])

  // Passed to child pages so they can jump to another page. Accepts
  // either a bare label or a [section, sub] tuple, plus an optional
  // recordId so pages can open directly to a specific record (used by
  // Emergency Contacts to jump straight to a student or customer).
  const navigate = useCallback((target, recordId = null) => {
    const [s, sb] = resolveNav(target)
    setSection(s)
    setSub(sb)
    setPendingRecordId(recordId)
  }, [])

  const clearPendingRecordId = useCallback(() => setPendingRecordId(null), [])

  const rendered = useMemo(() => {
    const key = `${section}:${sub}`
    const route = ROUTES[key]
    if (route) return route(navigate, pendingRecordId, clearPendingRecordId)
    return <Placeholder title={sub} />
  }, [section, sub, navigate, pendingRecordId, clearPendingRecordId])

  if (checkingAuth) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#5a6470' }}>
        Loading…
      </div>
    )
  }
  if (!authed) {
    return <Login onSignIn={(who, exp) => {
      setUser(who || null); setExpiresAt(exp || 0)
      setAuthed(true); setSection('home'); setSub('Dashboard')
    }} />
  }

  return (
    <StoreProvider>
      <div className="app">
        <style>{ACCOUNT_CSS + SESSION_CSS}</style>
        <TopNav section={section} sub={sub} onSubSelect={setSub} onLogout={logout} user={user} />
        <SessionTimer expiresAt={expiresAt} onExtend={setExpiresAt} onExpire={logout} />
        <div className="app-shell">
          <Sidebar section={section} onSelect={selectSection} />
          <main className="app-main">
            {rendered}
            <div className="app-footer">CraniaVerse · {sub}</div>
          </main>
        </div>
      </div>
    </StoreProvider>
  )
}
