import { useState } from 'react'
import { adminRequest } from '../adminApi'
import { formatBytes, formatDateTime, formatNumber, formatRelative } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import { useToast } from '../components/Toast'
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorNotice,
  KeyValue,
  Loading,
  Notice,
  PageHeader,
  StatCard,
} from '../components/ui'

function uptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

export default function System() {
  const notify = useToast()
  const system = useAdminQuery('/system')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  async function runCleanup() {
    setRunning(true)
    setError(null)
    try {
      const result = await adminRequest('/system/cleanup', { method: 'POST' })
      notify(`Cleanup finished: ${result.cleanup.archived} archived, ${result.cleanup.deleted} ended events removed.`)
      system.reload()
    } catch (runError) {
      setError(runError)
    } finally {
      setRunning(false)
    }
  }

  if (system.loading && !system.data) return <Loading />
  if (system.error && !system.data) return <ErrorNotice error={system.error} onRetry={system.reload} />
  const data = system.data
  const warnings = [
    !data.mail.configured && 'Email is not configured, so sign-up, login codes and admin sign-in codes cannot be sent.',
    data.mail.transport.startsWith('console') && 'Emails are printed to the server console (development mode).',
    data.security.seedPasswordStillSet && 'SUPER_ADMIN_PASSWORD is still set in server/.env. Remove it now that the first admin exists.',
    data.server.environment === 'production' && !data.security.frontendOrigins.length && 'FRONTEND_ORIGIN is not set; browser requests that change data will be rejected.',
    data.cleanup.error && `The last cleanup failed: ${data.cleanup.error}`,
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="System health"
        description="The API server, database, live connections and the cleanup job."
        actions={<Button onClick={system.reload}>Refresh</Button>}
      />

      {warnings.map((warning) => <Notice key={warning} tone="warning">{warning}</Notice>)}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Database latency" value={`${data.database.latencyMs} ms`} tone={data.database.latencyMs > 100 ? 'warning' : 'mint'} />
        <StatCard label="Live connections" value={formatNumber(data.sockets.connections)} hint={`${formatNumber(data.sockets.users)} people online`} />
        <StatCard label="Uptime" value={uptime(data.server.uptimeSeconds)} hint={`Since ${formatDateTime(data.server.startedAt)}`} />
        <StatCard label="Database size" value={formatBytes(data.database.totalBytes)} hint={`${data.database.name} · ${data.database.version}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Server">
          <KeyValue
            items={[
              ['Environment', <Badge key="env" tone={data.server.environment === 'production' ? 'mint' : 'warning'}>{data.server.environment}</Badge>],
              ['Node.js', data.server.node],
              ['Memory', `${data.server.memoryMb} MB (heap ${data.server.heapMb} MB)`],
              ['Email', data.mail.transport],
              ['Trusted proxies', data.security.trustProxy],
              ['Admin IP allowlist', data.security.adminIpAllowlist ? 'On' : 'Off'],
              ['Allowed frontend origins', data.security.frontendOrigins.join(', ') || 'Not set (localhost only in development)'],
              ['Settings loaded', formatRelative(data.settingsLoadedAt)],
            ]}
          />
        </Card>
        <Card title="Cleanup job" actions={<Button size="sm" onClick={runCleanup} disabled={running}>{running ? 'Running…' : 'Run now'}</Button>}>
          <p className="mb-4 text-sm text-muted">
            Runs every minute: archives and removes ended events, deletes event chat older than 24 hours and DMs older
            than 90 days, ends lapsed suspensions, and clears expired sign-in codes.
          </p>
          <ErrorNotice error={error} />
          <KeyValue
            items={[
              ['Last run', data.cleanup.lastRunAt ? `${formatRelative(data.cleanup.lastRunAt)} (${data.cleanup.durationMs} ms)` : 'Not yet'],
              ['Events archived', data.cleanup.archived],
              ['Ended events removed', data.cleanup.deleted],
              ['Suspensions ended', data.cleanup.unsuspended],
              ['Last error', data.cleanup.error || 'None'],
            ]}
          />
        </Card>
      </div>

      <Card title="Tables" padded={false}>
        <DataTable
          rowKey="name"
          rows={data.tables}
          columns={[
            { key: 'name', header: 'Table', render: (row) => <span className="font-mono text-xs">{row.name}</span> },
            { key: 'rows', header: 'Rows (estimate)', className: 'text-right tabular-nums', render: (row) => formatNumber(row.rows) },
            { key: 'bytes', header: 'Size', className: 'text-right tabular-nums', render: (row) => formatBytes(row.bytes) },
          ]}
        />
      </Card>
    </div>
  )
}
