import { useSearchParams } from 'react-router-dom'
import { adminUrl, queryString } from '../adminApi'
import { actionLabel } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import AuditList from '../components/AuditList'
import { DownloadIcon } from '../components/icons'
import { Card, ErrorNotice, Input, Loading, PageHeader, Pagination, Select } from '../components/ui'

const GROUPS = ['admin.', 'user.', 'event.', 'report.', 'settings.', 'announcement.', 'blocklist.', 'users.', 'audit.', 'system.']

export default function AuditLog() {
  const [params, setParams] = useSearchParams()
  const filters = {
    action: params.get('action') || '',
    adminId: params.get('adminId') || '',
    targetType: params.get('targetType') || '',
    targetId: params.get('targetId') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
  }
  const page = Number(params.get('page')) || 1
  const audit = useAdminQuery(`/audit${queryString({ ...filters, page })}`)
  const actions = useAdminQuery('/audit/actions')
  const admins = useAdminQuery('/admins')

  function update(key, value) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: key !== 'page' })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accountability"
        title="Audit log"
        description="Every action taken in this portal: who did it, to what, and why. Entries can't be edited or deleted."
        actions={
          <a
            href={adminUrl(`/audit/export.csv${queryString(filters)}`)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-bold hover:border-mint/40 hover:text-mint"
          >
            <DownloadIcon className="h-4 w-4" /> Export CSV
          </a>
        }
      />

      <Card padded={false}>
        <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Select aria-label="Action" value={filters.action} onChange={(event) => update('action', event.target.value)}>
            <option value="">All actions</option>
            <optgroup label="Groups">
              {GROUPS.map((group) => <option key={group} value={group}>All {group.slice(0, -1)} actions</option>)}
            </optgroup>
            <optgroup label="Actions">
              {(actions.data?.actions || []).map((action) => <option key={action} value={action}>{action} ({actionLabel(action)})</option>)}
            </optgroup>
          </Select>
          <Select aria-label="Admin" value={filters.adminId} onChange={(event) => update('adminId', event.target.value)}>
            <option value="">Any admin</option>
            {(admins.data?.admins || []).map((admin) => <option key={admin.id} value={admin.id}>{admin.name}</option>)}
          </Select>
          <Select aria-label="Target type" value={filters.targetType} onChange={(event) => update('targetType', event.target.value)}>
            <option value="">Any target</option>
            {['user', 'event', 'report', 'admin', 'settings', 'announcement', 'blocklist'].map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
          <Input type="date" aria-label="From" value={filters.from} onChange={(event) => update('from', event.target.value)} />
          <Input type="date" aria-label="To" value={filters.to} onChange={(event) => update('to', event.target.value)} />
        </div>
        {audit.error && <div className="p-4"><ErrorNotice error={audit.error} onRetry={audit.reload} /></div>}
        {audit.loading && !audit.data ? <Loading /> : <AuditList entries={audit.data?.items} showTarget />}
        {audit.data && (
          <Pagination page={audit.data.page} totalPages={audit.data.totalPages} total={audit.data.total} onPage={(value) => update('page', String(value))} />
        )}
      </Card>
    </div>
  )
}
