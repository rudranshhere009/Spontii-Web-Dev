import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '../../components/NavIcons'
import { adminRequest } from '../adminApi'
import { formatDateTime, formatRelative } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import { useToast } from '../components/Toast'
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorNotice,
  Field,
  Input,
  KeyValue,
  Loading,
  Notice,
  StatusBadge,
  Textarea,
} from '../components/ui'

const ACTIONS = [
  ['none', 'Dismiss', 'Nothing broke the guidelines.'],
  ['delete_message', 'Delete the message', 'Removes it for everyone, if it still exists.'],
  ['warn', 'Warn the user', 'Sends them a warning notification.'],
  ['suspend', 'Suspend the user', 'Signs them out and blocks login until a date.'],
  ['ban', 'Ban the user', 'Indefinite; closes their live events.'],
]
const DAY = 24 * 60 * 60 * 1000

function localInputValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16)
}

function Resolve({ report, onDone }) {
  const notify = useToast()
  const [action, setAction] = useState('none')
  const [note, setNote] = useState('')
  const [userMessage, setUserMessage] = useState('')
  const [until, setUntil] = useState(() => localInputValue(new Date(Date.now() + 7 * DAY)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const needsMessage = ['warn', 'suspend', 'ban'].includes(action)
  const userGone = !report.reported.exists

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await adminRequest(`/reports/${report.id}`, {
        method: 'PATCH',
        body: {
          action,
          note,
          ...(needsMessage && { userMessage }),
          ...(action === 'suspend' && { until: new Date(until).toISOString() }),
        },
      })
      notify(result.reportsResolved > 1 ? `${result.message} ${result.reportsResolved} reports of this message were closed.` : result.message)
      onDone()
    } catch (submitError) {
      setError(submitError)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-semibold text-muted">Action</legend>
        {ACTIONS.map(([value, label, hint]) => {
          const disabled = userGone && ['warn', 'suspend', 'ban'].includes(value)
          return (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${action === value ? 'border-mint bg-mint-soft' : 'border-border'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              <input type="radio" name="action" value={value} checked={action === value} disabled={disabled} onChange={() => setAction(value)} className="mt-1 accent-[var(--color-mint)]" />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          )
        })}
      </fieldset>
      {needsMessage && (
        <Field label="Message shown to the user" htmlFor="user-message">
          <Textarea id="user-message" value={userMessage} onChange={(event) => setUserMessage(event.target.value)} maxLength={500} required />
        </Field>
      )}
      {action === 'suspend' && (
        <Field label="Suspended until" htmlFor="report-until">
          <Input id="report-until" type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} required />
        </Field>
      )}
      <Field label="Resolution note (internal, saved in the audit log)" htmlFor="report-note">
        <Textarea id="report-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} required />
      </Field>
      <ErrorNotice error={error} />
      <Button type="submit" variant={['suspend', 'ban'].includes(action) ? 'danger' : 'primary'} disabled={busy}>
        {busy ? 'Saving…' : 'Resolve report'}
      </Button>
    </form>
  )
}

export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const detail = useAdminQuery(`/reports/${id}`)

  if (detail.loading && !detail.data) return <Loading />
  if (detail.error && !detail.data) return <ErrorNotice error={detail.error} onRetry={detail.reload} />
  const { report, messageExists, eventStatus, sameMessageReports, otherReports } = detail.data

  return (
    <div className="space-y-6">
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
        <ArrowLeftIcon className="h-4 w-4" /> Report queue
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-extrabold">Report #{report.id}</h1>
              <Badge tone={report.reason === 'safety' ? 'danger' : 'warning'}>{report.reason}</Badge>
              <StatusBadge status={report.status} />
            </div>
            <blockquote className="mt-4 whitespace-pre-wrap break-words rounded-xl border-l-4 border-warning bg-surface p-4 text-sm leading-relaxed">
              {report.snapshot}
            </blockquote>
            <p className="mt-2 text-xs text-muted">
              Saved when it was reported. The original message {messageExists ? 'still exists' : 'has been deleted (retention or moderation)'}.
              {sameMessageReports > 0 && ` ${sameMessageReports} other ${sameMessageReports === 1 ? 'person' : 'people'} reported this message too.`}
            </p>
          </Card>

          <Card title="Context">
            <KeyValue
              items={[
                ['Reported by', <Link key="reporter" to={`/admin/users/${report.reporter.id}`} className="font-semibold text-mint hover:underline">{report.reporter.name}</Link>],
                ['Reported', formatDateTime(report.createdAt)],
                ['Where', report.source === 'event' ? 'Event live chat' : 'Direct message'],
                report.source === 'event' && report.context && ['Event', (
                  <span key="event">
                    <Link to={`/admin/events/${report.context.id}`} className="font-semibold text-mint hover:underline">{report.context.label}</Link>
                    {eventStatus && <> <StatusBadge status={eventStatus} /></>}
                  </span>
                )],
                report.status !== 'open' && ['Resolved', `${formatDateTime(report.reviewedAt)} by ${report.reviewerName || 'an admin'}`],
                report.status !== 'open' && ['Action', report.actionTaken?.replace('_', ' ')],
                report.status !== 'open' && ['Note', report.resolutionNote],
              ]}
            />
          </Card>

          <Card title="Other reports about this user" padded={false}>
            <DataTable
              rows={otherReports}
              empty="This is the only report about them."
              onRowClick={(row) => navigate(`/admin/reports/${row.id}`)}
              columns={[
                { key: 'reason', header: 'Reason', render: (row) => <Badge>{row.reason}</Badge> },
                { key: 'snapshot', header: 'Message', render: (row) => <span className="line-clamp-2 max-w-md text-xs">{row.snapshot}</span> },
                { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                { key: 'createdAt', header: 'When', render: (row) => formatRelative(row.createdAt) },
              ]}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Reported user">
            {report.reported.exists ? (
              <>
                <Link to={`/admin/users/${report.reported.id}`} className="text-lg font-extrabold hover:text-mint">{report.reported.name}</Link>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge status={report.reported.status} />
                  <Badge tone={report.reported.reportsAgainst > 2 ? 'danger' : 'neutral'}>{report.reported.reportsAgainst} reports</Badge>
                  <Badge tone={report.reported.warnings ? 'warning' : 'neutral'}>{report.reported.warnings} warnings</Badge>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">This account has been deleted.</p>
            )}
          </Card>
          <Card title={report.status === 'open' ? 'Resolve' : 'Resolved'}>
            {report.status === 'open'
              ? <Resolve report={report} onDone={detail.reload} />
              : <Notice>This report is closed. Open the user to take further action.</Notice>}
          </Card>
        </div>
      </div>
    </div>
  )
}
