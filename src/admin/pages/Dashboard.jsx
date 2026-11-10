import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminAuth } from '../AdminAuthContext'
import { formatNumber } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import { BarList, ColumnChart, LineChart } from '../components/charts'
import { ErrorNotice, Loading, PageHeader, StatCard, Tabs } from '../components/ui'

const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

function Attention({ overview }) {
  const items = [
    overview.reports.openSafety > 0 && {
      to: '/admin/reports?reason=safety',
      tone: 'border-danger/40 text-danger',
      text: `${overview.reports.openSafety} open safety report${overview.reports.openSafety === 1 ? '' : 's'}`,
    },
    overview.reports.open > 0 && {
      to: '/admin/reports',
      tone: 'border-warning/40 text-warning',
      text: `${overview.reports.open} report${overview.reports.open === 1 ? '' : 's'} waiting for review`,
    },
    overview.users.suspended > 0 && {
      to: '/admin/users?status=suspended',
      tone: 'border-border text-text',
      text: `${overview.users.suspended} suspended account${overview.users.suspended === 1 ? '' : 's'}`,
    },
  ].filter(Boolean)
  if (!items.length) {
    return <p className="rounded-2xl border border-mint/30 bg-mint-soft px-4 py-3 text-sm">Nothing needs your attention right now.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link key={item.to} to={item.to} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold hover:bg-text/5 ${item.tone}`}>
          {item.text} →
        </Link>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { admin } = useAdminAuth()
  const [days, setDays] = useState('30')
  const overview = useAdminQuery('/stats/overview')
  const timeseries = useAdminQuery(`/stats/timeseries?days=${days}`)
  const places = useAdminQuery('/stats/places')

  const data = overview.data
  const series = timeseries.data

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${admin?.name?.split(' ')[0] || 'admin'}`}
        description="How Spontii is doing today. Counts follow the database's time zone."
      />

      {overview.error && <ErrorNotice error={overview.error} onRetry={overview.reload} />}
      {!data ? <Loading /> : (
        <>
          <Attention overview={data} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Users" value={formatNumber(data.users.total)} hint={`${formatNumber(data.users.newWeek)} new this week · ${formatNumber(data.users.newToday)} today`} />
            <StatCard label="Active today" value={formatNumber(data.activeUsers.dau)} hint={`${formatNumber(data.activeUsers.wau)} this week · ${formatNumber(data.activeUsers.mau)} this month`} tone="mint" />
            <StatCard label="Live events" value={formatNumber(data.events.live)} hint={`${data.events.happeningNow} happening now · ${data.events.public} public, ${data.events.friends} friends, ${data.events.private} private`} />
            <StatCard label="Open reports" value={formatNumber(data.reports.open)} hint={`${data.reports.resolvedWeek} resolved this week`} tone={data.reports.open ? 'warning' : 'text'} />
            <StatCard label="Pending join requests" value={formatNumber(data.events.pendingRequests)} hint="Across live events" />
            <StatCard label="Messages today" value={formatNumber(data.messagesToday.event + data.messagesToday.direct)} hint={`${formatNumber(data.messagesToday.event)} event chat · ${formatNumber(data.messagesToday.direct)} DMs`} />
            <StatCard label="Events ended (30 days)" value={formatNumber(data.events.endedMonth)} hint={`${data.events.averageAttendees} going on average · ${data.events.closedByAdminMonth} closed by admins`} />
            <StatCard label="Points in circulation" value={formatNumber(data.users.pointsInCirculation)} hint={`${formatNumber(data.users.verified)} verified users · ${formatNumber(data.friendships)} friendships`} />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs tabs={RANGES} value={days} onChange={setDays} />
        <p className="text-xs text-muted-2">
          Signups go back to launch. Activity, events and messages are counted from when the admin portal was installed.
        </p>
      </div>
      {timeseries.error && <ErrorNotice error={timeseries.error} onRetry={timeseries.reload} />}
      {series && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <ColumnChart title="New signups" dates={series.dates} values={series.series.signups} unit="signups" loading={timeseries.loading} />
          <LineChart title="Daily active users" dates={series.dates} values={series.series.active_users} unit="active users" loading={timeseries.loading} />
          <ColumnChart title="Events created" dates={series.dates} values={series.series.events_created} unit="events" loading={timeseries.loading} />
          <ColumnChart title="Event chat messages" dates={series.dates} values={series.series.event_messages} unit="messages" loading={timeseries.loading} />
          <ColumnChart title="Direct messages" dates={series.dates} values={series.series.direct_messages} unit="messages" loading={timeseries.loading} />
          {data && (
            <BarList
              title="Profile completion (active users)"
              unit="users"
              items={[0, 20, 40, 60, 80, 100].map((percent) => ({
                label: `${percent}% complete`,
                value: data.profileCompletion.find((row) => row.percent === percent)?.users || 0,
              }))}
            />
          )}
        </div>
      )}

      {places.data && (
        <div className="grid gap-4 md:grid-cols-2">
          <BarList
            title="Top cities by users"
            unit="users"
            items={places.data.userCities.map((row) => ({ label: row.place, value: row.total }))}
            empty="No one has added a city yet."
          />
          <BarList
            title="Events by place (live + last 30 days)"
            unit="events"
            items={places.data.eventPlaces.map((row) => ({ label: row.place, value: row.total }))}
            empty="No events yet."
          />
        </div>
      )}
    </div>
  )
}
