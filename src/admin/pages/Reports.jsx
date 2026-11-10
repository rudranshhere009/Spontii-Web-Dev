import { useNavigate, useSearchParams } from 'react-router-dom'
import { queryString } from '../adminApi'
import { formatRelative } from '../format'
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

const REASONS = ['safety', 'harassment', 'inappropriate', 'spam', 'other']

export default function Reports() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || 'open'
  const reason = params.get('reason') || ''
  const source = params.get('source') || ''
  const q = params.get('q') || ''
  const page = Number(params.get('page')) || 1
  const summary = useAdminQuery('/reports/summary')
  const reports = useAdminQuery(`/reports${queryString({ status, reason, source, q, page })}`)

  function update(changes) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: !('page' in changes) })
  }

  const counts = summary.data?.byStatus || {}
  const openByReason = summary.data?.openByReason || {}

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trust & safety"
        title="Reports"
        description="Messages people reported from event chats and DMs. The open queue shows safety reports first, then the oldest."
      />

      {status === 'open' && (
        <div className="flex flex-wrap gap-2">
          {REASONS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => update({ reason: reason === item ? '' : item })}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                reason === item ? 'border-mint bg-mint-soft text-mint' : 'border-border text-muted hover:text-text'
              }`}
            >
              {item} <span className="opacity-70">{openByReason[item] || 0}</span>
            </button>
          ))}
        </div>
      )}

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <Tabs
            value={status}
            onChange={(value) => update({ status: value === 'open' ? '' : value })}
            tabs={[
              { value: 'open', label: 'Open', count: counts.open || 0 },
              { value: 'actioned', label: 'Actioned', count: counts.actioned || 0 },
              { value: 'reviewed', label: 'Dismissed', count: counts.reviewed || 0 },
              { value: 'all', label: 'All' },
            ]}
          />
          <div className="ml-auto grid w-full gap-3 sm:grid-cols-3 lg:w-auto">
            <Input
              type="search"
              aria-label="Search reports"
              placeholder="Reported user or message text"
              key={q}
              defaultValue={q}
              onKeyDown={(event) => event.key === 'Enter' && update({ q: event.currentTarget.value.trim() })}
              onBlur={(event) => event.currentTarget.value.trim() !== q && update({ q: event.currentTarget.value.trim() })}
            />
            <Select aria-label="Reason" value={reason} onChange={(event) => update({ reason: event.target.value })}>
              <option value="">Any reason</option>
              {REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select aria-label="Where" value={source} onChange={(event) => update({ source: event.target.value })}>
              <option value="">Event chats and DMs</option>
              <option value="event">Event chats</option>
              <option value="direct">Direct messages</option>
            </Select>
          </div>
        </div>

        {reports.error && <div className="p-4"><ErrorNotice error={reports.error} onRetry={reports.reload} /></div>}
        <DataTable
          loading={reports.loading}
          rows={reports.data?.items || []}
          empty={status === 'open' ? 'The queue is clear. Nice.' : 'No reports here.'}
          onRowClick={(row) => navigate(`/admin/reports/${row.id}`)}
          columns={[
            { key: 'reason', header: 'Reason', render: (row) => <Badge tone={row.reason === 'safety' ? 'danger' : row.reason === 'harassment' ? 'warning' : 'neutral'}>{row.reason}</Badge> },
            { key: 'snapshot', header: 'Reported message', render: (row) => <span className="line-clamp-2 max-w-md">{row.snapshot}</span> },
            {
              key: 'reported',
              header: 'Reported user',
              render: (row) => (
                <div>
                  <p className="font-semibold">{row.reported.name}</p>
                  <p className="text-xs text-muted">{row.reported.reportsAgainst} report{row.reported.reportsAgainst === 1 ? '' : 's'} total</p>
                </div>
              ),
            },
            { key: 'source', header: 'Where', render: (row) => (row.source === 'event' ? row.context?.label || 'Event chat' : 'DM') },
            { key: 'createdAt', header: 'Reported', render: (row) => formatRelative(row.createdAt) },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
          ]}
        />
        {reports.data && (
          <Pagination page={reports.data.page} totalPages={reports.data.totalPages} total={reports.data.total} onPage={(value) => update({ page: String(value) })} />
        )}
      </Card>
    </div>
  )
}
