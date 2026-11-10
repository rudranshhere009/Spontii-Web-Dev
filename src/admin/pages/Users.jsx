import { useNavigate, useSearchParams } from 'react-router-dom'
import { adminUrl, queryString } from '../adminApi'
import { formatDate, formatNumber, formatRelative } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import { DownloadIcon } from '../components/icons'
import {
  Avatar,
  Badge,
  Card,
  DataTable,
  ErrorNotice,
  Input,
  PageHeader,
  Pagination,
  Select,
  StatusBadge,
} from '../components/ui'

const FILTER_KEYS = ['q', 'status', 'verified', 'city', 'joinedFrom', 'joinedTo', 'sort']

export default function Users() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) || '']))
  const page = Number(params.get('page')) || 1
  const query = queryString({ ...filters, page, pageSize: 25 })
  const users = useAdminQuery(`/users${query}`)

  function setFilter(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }

  function setPage(value) {
    const next = new URLSearchParams(params)
    next.set('page', String(value))
    setParams(next)
  }

  const exportHref = adminUrl(`/users/export.csv${queryString(filters)}`)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Community"
        title="Users"
        description="Everyone with a Spontii account. Open a user to suspend, ban, verify, adjust points or remove content."
        actions={
          <a
            href={exportHref}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold hover:border-mint/40 hover:text-mint"
          >
            <DownloadIcon className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2">
            <Input
              type="search"
              aria-label="Search users"
              placeholder="Name, email, phone or Spontiii ID"
              key={filters.q}
              defaultValue={filters.q}
              onKeyDown={(event) => event.key === 'Enter' && setFilter('q', event.currentTarget.value.trim())}
              onBlur={(event) => event.currentTarget.value.trim() !== filters.q && setFilter('q', event.currentTarget.value.trim())}
            />
          </div>
          <Select aria-label="Status" value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </Select>
          <Select aria-label="Verification" value={filters.verified} onChange={(event) => setFilter('verified', event.target.value)}>
            <option value="">Verified or not</option>
            <option value="yes">Spontii Verified</option>
            <option value="no">Not verified</option>
          </Select>
          <Input
            aria-label="City"
            placeholder="City"
            key={filters.city}
            defaultValue={filters.city}
            onKeyDown={(event) => event.key === 'Enter' && setFilter('city', event.currentTarget.value.trim())}
            onBlur={(event) => event.currentTarget.value.trim() !== filters.city && setFilter('city', event.currentTarget.value.trim())}
          />
          <Select aria-label="Sort" value={filters.sort} onChange={(event) => setFilter('sort', event.target.value)}>
            <option value="">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Name A–Z</option>
            <option value="last_seen">Recently active</option>
            <option value="points">Most points</option>
            <option value="score">Highest score</option>
            <option value="reports">Most reported</option>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2 lg:col-span-3">
            Joined from
            <Input type="date" value={filters.joinedFrom} onChange={(event) => setFilter('joinedFrom', event.target.value)} className="w-auto flex-1" />
            to
            <Input type="date" value={filters.joinedTo} onChange={(event) => setFilter('joinedTo', event.target.value)} className="w-auto flex-1" />
          </label>
        </div>

        {users.error && <div className="p-4"><ErrorNotice error={users.error} onRetry={users.reload} /></div>}

        <DataTable
          loading={users.loading}
          rows={users.data?.items || []}
          empty="No users match these filters."
          onRowClick={(row) => navigate(`/admin/users/${row.id}`)}
          columns={[
            {
              key: 'name',
              header: 'User',
              render: (row) => (
                <div className="flex items-center gap-3">
                  <Avatar src={row.hasPhoto ? adminUrl(`/users/${row.id}/photo`) : null} name={row.name} size="h-9 w-9" />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-semibold">
                      {row.name}
                      {row.verified && <Badge tone="mint">Verified</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted">{row.email}</p>
                  </div>
                </div>
              ),
            },
            { key: 'spontiiiId', header: 'Spontiii ID', render: (row) => <span className="font-mono text-xs">{row.spontiiiId}</span> },
            { key: 'city', header: 'City', render: (row) => row.city || <span className="text-muted-2">—</span> },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            { key: 'points', header: 'Points', className: 'text-right tabular-nums', render: (row) => formatNumber(row.points) },
            {
              key: 'reportsAgainst',
              header: 'Reports',
              className: 'text-right tabular-nums',
              render: (row) => (row.reportsAgainst ? <span className="font-bold text-warning">{row.reportsAgainst}</span> : '0'),
            },
            { key: 'createdAt', header: 'Joined', render: (row) => formatDate(row.createdAt) },
            { key: 'lastSeenAt', header: 'Last active', render: (row) => formatRelative(row.lastSeenAt) },
          ]}
        />
        {users.data && (
          <Pagination page={users.data.page} totalPages={users.data.totalPages} total={users.data.total} onPage={setPage} />
        )}
      </Card>
    </div>
  )
}
