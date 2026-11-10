import { useEffect, useState } from 'react'
import { adminRequest } from '../adminApi'
import { formatDateTime, formatNumber } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import { useToast } from '../components/Toast'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  ErrorNotice,
  Field,
  Input,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '../components/ui'

const AUDIENCE_LABELS = {
  all: 'Everyone',
  city: 'People in a city',
  hosts: 'Hosts of live events',
  users: 'Specific users',
}

function audienceText(audience) {
  if (audience.type === 'city') return `City: ${audience.value}`
  if (audience.type === 'users') return `${audience.value.length} users`
  return AUDIENCE_LABELS[audience.type] || audience.type
}

function audiencePayload(type, value) {
  if (type === 'city') return { type, value: value.trim() }
  if (type === 'users') return { type, value: value.split(/[\s,]+/).filter(Boolean) }
  return { type }
}

export default function Announcements() {
  const notify = useToast()
  const [page, setPage] = useState(1)
  const history = useAdminQuery(`/announcements?page=${page}`)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [route, setRoute] = useState('')
  const [type, setType] = useState('all')
  const [value, setValue] = useState('')
  const [preview, setPreview] = useState({ key: '', count: null })
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState(null)

  const audienceKey = `${type}:${value}`
  const audienceReady = type === 'all' || type === 'hosts' || value.trim()

  /* Shows how many active users the audience reaches before sending. */
  useEffect(() => {
    if (!audienceReady) return undefined
    let active = true
    const timer = setTimeout(() => {
      adminRequest('/announcements/preview', { method: 'POST', body: { audience: audiencePayload(type, value) } })
        .then((result) => {
          if (active) setPreview({ key: audienceKey, count: result.recipients })
        })
        .catch(() => {
          if (active) setPreview({ key: audienceKey, count: null })
        })
    }, 300)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [type, value, audienceKey, audienceReady])

  const recipients = audienceReady && preview.key === audienceKey ? preview.count : null

  async function send() {
    const result = await adminRequest('/announcements', {
      method: 'POST',
      body: { title, message, route, audience: audiencePayload(type, value) },
    })
    notify(`Sent to ${formatNumber(result.recipients)} people.`)
    setTitle('')
    setMessage('')
    setRoute('')
    setPage(1)
    history.reload()
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communication"
        title="Announcements"
        description="Send an in-app notification from the Spontii team. It appears in each person's notification bell."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title="New announcement">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              setConfirm(true)
            }}
            className="space-y-4"
          >
            <Field label="Title" htmlFor="announcement-title" hint={`${title.length}/120`}>
              <Input id="announcement-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} required />
            </Field>
            <Field label="Message" htmlFor="announcement-message" hint={`${message.length}/500`}>
              <Textarea id="announcement-message" rows={4} value={message} maxLength={500} onChange={(event) => setMessage(event.target.value)} required />
            </Field>
            <Field label="Open button link (optional)" htmlFor="announcement-route" hint="A path inside Spontii, like /explore or /create.">
              <Input id="announcement-route" value={route} placeholder="/explore" onChange={(event) => setRoute(event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Send to" htmlFor="announcement-audience">
                <Select id="announcement-audience" value={type} onChange={(event) => { setType(event.target.value); setValue('') }}>
                  {Object.entries(AUDIENCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </Select>
              </Field>
              {type === 'city' && (
                <Field label="City (as on profiles)" htmlFor="announcement-city">
                  <Input id="announcement-city" value={value} placeholder="Mumbai" onChange={(event) => setValue(event.target.value)} required />
                </Field>
              )}
              {type === 'users' && (
                <Field label="User IDs (comma or space separated)" htmlFor="announcement-users">
                  <Input id="announcement-users" value={value} placeholder="12, 17, 42" onChange={(event) => setValue(event.target.value)} required />
                </Field>
              )}
            </div>
            <ErrorNotice error={error} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" disabled={!title.trim() || !message.trim() || !audienceReady}>Review and send</Button>
              <span className="text-sm text-muted">
                {recipients == null ? 'Counting recipients…' : `Reaches ${formatNumber(recipients)} active ${recipients === 1 ? 'person' : 'people'}`}
              </span>
            </div>
          </form>
        </Card>

        <Card title="Preview">
          <div className="rounded-2xl border border-mint/25 bg-mint/[0.06] p-3.5">
            <p className="text-sm font-bold">{title || 'Announcement title'}</p>
            <p className="mt-1 text-sm leading-5 text-muted">{message || 'Your message appears here, in the notification bell.'}</p>
            {route && <span className="mt-2 inline-block rounded-md bg-mint px-2.5 py-1 text-xs font-bold text-bg">Open</span>}
          </div>
          <p className="mt-3 text-xs text-muted-2">Suspended and banned accounts never receive announcements.</p>
        </Card>
      </div>

      <Card title="Sent" padded={false}>
        {history.error && <div className="p-4"><ErrorNotice error={history.error} onRetry={history.reload} /></div>}
        <DataTable
          loading={history.loading}
          rows={history.data?.items || []}
          empty="No announcements sent yet."
          columns={[
            {
              key: 'title',
              header: 'Announcement',
              render: (row) => (
                <div className="max-w-md">
                  <p className="font-semibold">{row.title}</p>
                  <p className="line-clamp-2 text-xs text-muted">{row.message}</p>
                </div>
              ),
            },
            { key: 'audience', header: 'Audience', render: (row) => <Badge>{audienceText(row.audience)}</Badge> },
            { key: 'recipients', header: 'Sent to', className: 'text-right tabular-nums', render: (row) => formatNumber(row.recipients) },
            {
              key: 'opened',
              header: 'Opened',
              className: 'text-right tabular-nums',
              render: (row) => (row.recipients ? `${formatNumber(row.opened)} (${Math.round((row.opened / row.recipients) * 100)}%)` : '—'),
            },
            { key: 'createdAt', header: 'Sent', render: (row) => `${formatDateTime(row.createdAt)}${row.adminName ? ` · ${row.adminName}` : ''}` },
          ]}
        />
        {history.data && <Pagination page={history.data.page} totalPages={history.data.totalPages} total={history.data.total} onPage={setPage} />}
      </Card>

      <ConfirmDialog
        open={confirm}
        title="Send this announcement?"
        description={`“${title}” goes to ${recipients == null ? 'the selected audience' : `${formatNumber(recipients)} people`} right away. It can't be unsent.`}
        confirmLabel="Send now"
        onClose={() => setConfirm(false)}
        onConfirm={send}
      />
    </div>
  )
}
