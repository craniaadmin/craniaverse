// Marketing Calendar — the same month-view/event UI as the operations
// Calendar (CalendarView.jsx), but pointed at its own independent
// PocketBase collection (/api/marketing-calendar). No data — events,
// categories, visibility — is ever shared with the real school
// Calendar; this is purely for planning content/campaigns (social
// posts, email blasts, ads, promos, blog posts).
import CalendarView from './CalendarView'

export default function MarketingCalendar() {
  return (
    <CalendarView
      apiPath="/api/marketing-calendar"
      title="Marketing Calendar"
      backupCollection="marketingCalendar"
    />
  )
}
