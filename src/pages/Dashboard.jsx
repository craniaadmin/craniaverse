import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, RadialBarChart, RadialBar,
} from 'recharts'
import { CheckSquare, Check, X, ChevronDown, Search } from 'lucide-react'
import { revenueByProgram, trendData, dashboardCards } from '../data/mockData'

const gaugeData = [{ name: 'rev', value: 72, fill: '#4f9ea0' }]

function StatusCard({ title, children, onOpen }) {
  return (
    <div className="status-card">
      <div className="sc-head" onClick={onOpen}>
        <span>{title}</span>
        <ChevronDown size={16} />
      </div>
      <div className="sc-body">{children}</div>
    </div>
  )
}

export default function Dashboard({ onNavigate }) {
  const { tasks, calendar, attendance } = dashboardCards
  return (
    <div className="page">
      <h2 className="page-title">Dashboard</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 20 }}>
        {/* Left: charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="small muted" style={{ fontWeight: 700 }}>MONTHLY REVENUE</div>
              <div style={{ position: 'relative', height: 132 }}>
                <ResponsiveContainer>
                  <RadialBarChart innerRadius="74%" outerRadius="100%" data={gaugeData} startAngle={180} endAngle={0}>
                    <RadialBar background dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, textAlign: 'center', fontSize: 26, fontWeight: 800, color: '#20304a' }}>$13,450</div>
              </div>
              <div className="small muted" style={{ textAlign: 'center' }}>72% of monthly target</div>
            </div>
            <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
              <Stat n="128" label="Active students" />
              <Stat n="42" label="Customers" />
              <Stat n="9" label="Programs running" />
            </div>
          </div>

          <div className="card" style={{ padding: '16px 14px 8px' }}>
            <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>REVENUE BY PROGRAM</div>
            <div style={{ height: 210 }}>
              <ResponsiveContainer>
                <BarChart data={revenueByProgram} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef1f3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5b6573' }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#8b95a3' }} />
                  <Tooltip />
                  <Bar dataKey="target" name="Target" fill="#2e2a23" radius={[3, 3, 0, 0]} barSize={16} />
                  <Bar dataKey="actual" name="Actual" fill="#9cd4e8" radius={[3, 3, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ padding: '16px 14px 8px' }}>
            <div className="small muted" style={{ fontWeight: 700, marginBottom: 6 }}>REGISTRATIONS vs CANCELLATIONS</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={trendData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef1f3" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#8b95a3' }} interval={0} angle={-30} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 11, fill: '#8b95a3' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Registrations" stroke="#7fc6e0" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Cancellations" stroke="#cfd6da" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right: status cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, alignContent: 'start' }}>
          <StatusCard title="TASKS" onOpen={() => onNavigate('To Do')}>
            {tasks.map((t, i) => (
              <div className="sc-row" key={i}><CheckSquare size={17} color="#5b9494" /> {t.label}</div>
            ))}
          </StatusCard>
          <StatusCard title="CALENDAR" onOpen={() => onNavigate('Calendar')}>
            {calendar.map((c, i) => (
              <div className="sc-row" key={i}><CheckSquare size={17} color="#5b9494" /> {c.label}</div>
            ))}
          </StatusCard>
          <StatusCard title="ATTENDANCE">
            {attendance.map((a, i) => (
              <div className="sc-row" key={i}>
                {a.ok
                  ? <Check size={18} color="#fff" style={{ background: '#4caf50', borderRadius: '50%', padding: 2 }} />
                  : <X size={18} color="#fff" style={{ background: '#e8503f', borderRadius: '50%', padding: 2 }} />}
                <span>{a.name} — {a.time} - {a.cls}</span>
              </div>
            ))}
          </StatusCard>

          <StatusCard title="PAYMENT PENDING" onOpen={() => onNavigate('Payments')}><Empty /></StatusCard>
          <StatusCard title="CANCELLATIONS"><Empty /></StatusCard>
          <StatusCard title="HOLDS"><Empty /></StatusCard>

          <StatusCard title="STUDENTS" onOpen={() => onNavigate('Students')}><Empty /></StatusCard>
          <StatusCard title="CUSTOMERS" onOpen={() => onNavigate('Customers')}><Empty /></StatusCard>
          <StatusCard title="STAFF"><Empty /></StatusCard>

          <StatusCard title="CURRICULUM"><Empty /></StatusCard>
          <StatusCard title="INVENTORY" onOpen={() => onNavigate('Inventory')}><Empty /></StatusCard>
          <StatusCard title="SEARCH"><div className="sc-row"><Search size={16} color="#8b95a3" /> <span className="muted small">Search records…</span></div></StatusCard>
        </div>
      </div>
    </div>
  )
}

function Stat({ n, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: '#2c7a7b', minWidth: 56 }}>{n}</div>
      <div className="muted small">{label}</div>
    </div>
  )
}
function Empty() { return <div className="sc-empty">No items</div> }
