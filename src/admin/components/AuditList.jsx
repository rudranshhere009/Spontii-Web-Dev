import { Link } from 'react-router-dom'
import { actionLabel, formatDateTime } from '../format'
import { Badge, EmptyState } from './ui'

const TARGET_LINKS = {
  user: (id) => `/admin/users/${id}`,
  event: (id) => `/admin/events/${id}`,
  report: (id) => `/admin/reports/${id}`,
}

const HIDDEN_DETAIL_KEYS = new Set(['closedEvents', 'removed', 'filters'])

function detailSummary(details) {
  if (!details || typeof details !== 'object') return null
  return Object.entries(details)
    .filter(([key, value]) => !HIDDEN_DETAIL_KEYS.has(key) && value !== null && value !== '' && typeof value !== 'object')
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ')
}

/* One line per admin action, newest first. `showTarget` adds a link to what was changed. */
export default function AuditList({ entries, showTarget = false }) {
  if (!entries?.length) return <EmptyState title="No admin actions recorded yet." />
  return (
    <ol className="divide-y divide-border/60">
      {entries.map((entry) => {
        const link = TARGET_LINKS[entry.targetType]?.(entry.targetId)
        const summary = detailSummary(entry.details)
        return (
          <li key={entry.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3 text-sm">
            <span className="w-40 shrink-0 text-xs text-muted">{formatDateTime(entry.createdAt)}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {actionLabel(entry.action)}
                <Badge className="ml-2 align-middle">{entry.action.split('.')[0]}</Badge>
              </p>
              {summary && <p className="mt-0.5 break-words text-xs text-muted">{summary}</p>}
            </div>
            <div className="text-right text-xs text-muted">
              <p>{entry.admin ? entry.admin.name : 'System / CLI'}</p>
              {showTarget && entry.targetType && (
                link && entry.targetId
                  ? <Link to={link} className="font-semibold text-mint hover:underline">{entry.targetType} #{entry.targetId.slice(0, 8)}</Link>
                  : <span>{entry.targetType}{entry.targetId ? ` #${entry.targetId}` : ''}</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
