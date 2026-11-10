import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { queryString } from '../adminApi'
import { formatDateTime } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import {
  Badge,
  Card,
  DataTable,
  ErrorNotice,
  Input,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
  Tabs,
} from '../components/ui'

const TABS = [
  { value: 'live', label: 'Live' },
  { value: 'completed', label: 'Completed (not yet ended)' },
  { value: 'archive', label: 'Archive' },
]

export default function Events() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'live'
  const q = params.get('q') || ''
  const place = params.get('place') || ''
  const visibility = params.get('visibility') || ''
  const sort = params.get('sort') || ''
  const completedBy = params.get('completedBy') || ''
  const page = Number(params.get('page')) || 1

  const path = tab === 'archive'
    ? `/events/archive${queryString({ q, place, completedBy, page })}`
    : `/events${queryString({ status: tab, q, place, visibility, sort, page })}`
  const events = useAdminQuery(path)

  function update(changes) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: !('page' in changes) })
  }

  const columns = [
    {
      key: 'title',
      header: 'Event',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.title}</p>
          <p className="truncate text-xs text-muted">{row.category} · {row.area ? `${row.area}, ` : ''}{row.city}</p>
        </div>
      ),
    },
    {
      key: 'host',
      header: 'Host',
      render: (row) => row.host.id
        ? (
          <Link to={`/admin/users/${row.host.id}`} onClick={(event) => event.stopPropagation()} className="font-semibold text-mint hover:underline">
            {row.host.name}
          </Link>
        )
        : <span className="text-muted">{row.host.name}</span>,
    },
    { key: 'visibility', header: 'Visibility', render: (row) => <Badge>{row.visibility}</Badge> },
    { key: 'startsAt', header: 'Starts', render: (row) => formatDateTime(row.startsAt) },
    { key: 'attendees', header: 'Going', className: 'text-right tabular-nums', render: (row) => `${row.attendees}/${row.capacity}` },
    tab === 'archive'
      ? { key: 'completedBy', header: 'Ended by', render: (row) => <Badge tone={row.completedBy === 'admin' ? 'danger' : 'neutral'}>{row.completedBy}</Badge> }
      : {
        key: 'pendingRequests',
        header: 'Requests',
        className: 'text-right tabular-nums',
        render: (row) => (row.pendingRequests ? <span className="font-bold text-warning">{row.pendingRequests}</span> : '0'),
      },
    {
      key: 'reports',
      header: 'Reports',
      className: 'text-right tabular-nums',
      render: (row) => {
        const count = tab === 'archive' ? row.counts.reports : row.reports
        return count ? <span className="font-bold text-danger">{count}</span> : '0'
      },
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Activity"
        title="Events"
        description="Every event, including private and friends-only ones. Ended events are kept in the archive without their media or messages."
      />

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <Tabs tabs={TABS} value={tab} onChange={(value) => update({ tab: value === 'live' ? '' : value, visibility: '', sort: '', completedBy: '' })} />
          <div className="ml-auto grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-4">
            <Input
              type="search"
              aria-label="Search events"
              placeholder="Title, host or event ID"
              key={`q-${q}`}
              defaultValue={q}
              onKeyDown={(event) => event.key === 'Enter' && update({ q: event.currentTarget.value.trim() })}
              onBlur={(event) => event.currentTarget.value.trim() !== q && update({ q: event.currentTarget.value.trim() })}
            />
            <Input
              aria-label="City or state"
              placeholder="City or state"
              key={`p-${place}`}
              defaultValue={place}
              onKeyDown={(event) => event.key === 'Enter' && update({ place: event.currentTarget.value.trim() })}
              onBlur={(event) => event.currentTarget.value.trim() !== place && update({ place: event.currentTarget.value.trim() })}
            />
            {tab === 'archive' ? (
              <Select aria-label="Ended by" value={completedBy} onChange={(event) => update({ completedBy: event.target.value })}>
                <option value="">Ended by anyone</option>
                <option value="system">Ended on schedule</option>
                <option value="host">Completed by host</option>
                <option value="admin">Closed by admin</option>
              </Select>
            ) : (
              <Select aria-label="Visibility" value={visibility} onChange={(event) => update({ visibility: event.target.value })}>
                <option value="">All visibility</option>
                <option value="public">Public</option>
                <option value="friends">Friends only</option>
                <option value="private">Private</option>
              </Select>
            )}
            {tab !== 'archive' && (
              <Select aria-label="Sort" value={sort} onChange={(event) => update({ sort: event.target.value })}>
                <option value="">Starting soonest</option>
                <option value="newest">Newest created</option>
                <option value="requests">Most pending requests</option>
              </Select>
            )}
          </div>
        </div>

        {events.error && <div className="p-4"><ErrorNotice error={events.error} onRetry={events.reload} /></div>}
        <DataTable
          loading={events.loading}
          rows={events.data?.items || []}
          empty={tab === 'archive' ? 'No archived events yet.' : 'No events match.'}
          onRowClick={(row) => navigate(`/admin/events/${row.id}`)}
          columns={columns}
        />
        {events.data && (
          <Pagination page={events.data.page} totalPages={events.data.totalPages} total={events.data.total} onPage={(value) => update({ page: String(value) })} />
        )}
      </Card>
    </div>
  )
}
