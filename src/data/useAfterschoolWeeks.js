// Fetches the live Calendar data once and extracts the "Afterschool"
// calendar's real Week 1..35 dates — the ground truth for scheduling
// lesson rows. Using the real calendar means breaks (Thanksgiving,
// Winter Break, March Break, etc.) are correctly skipped instead of
// assumed away by a flat 7-day cadence.
import { useEffect, useState } from 'react'
import { weekDatesFromCalendarEvents } from './scheduleUtils'

const API_BASE = import.meta.env?.VITE_API_URL || ''
const HEADERS = { 'ngrok-skip-browser-warning': 'true' }

export function useAfterschoolWeeks() {
  const [weekDates, setWeekDates] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch(`${API_BASE}/api/calendar`, { headers: HEADERS })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!alive || !data) return
        const afterschool = (data.calendars || []).find(c => /afterschool/i.test(c.name || ''))
        if (afterschool) {
          setWeekDates(weekDatesFromCalendarEvents(data.events || [], afterschool.id))
        }
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return { weekDates, loading }
}
