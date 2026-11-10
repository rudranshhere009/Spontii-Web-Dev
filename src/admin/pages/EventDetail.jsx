import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '../../components/NavIcons'
import { adminRequest, adminUrl, queryString } from '../adminApi'
import { formatBytes, formatDateTime, formatRelative } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import AuditList from '../components/AuditList'
import { useToast } from '../components/Toast'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorNotice,
  KeyValue,
  Loading,
  Notice,
  StatCard,
  StatusBadge,
} from '../components/ui'

/* Hosts can paste any banner URL; a broken one is hidden instead of showing a broken-image icon. */
function Banner({ src }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) return null
  return <img src={src} alt="" onError={() => setFailed(true)} className="h-24 w-36 shrink-0 rounded-xl border border-border object-cover" />
}

function HostLink({ host }) {
  if (!host?.id) return <span>{host?.name || 'Deleted user'}</span>
  return (
    <Link to={`/admin/users/${host.id}`} className="font-semibold text-mint hover:underline">
      {host.name}
    </Link>
  )
}

function ArchivedEvent({ event }) {
  return (
    <div className="space-y-6">
      <Notice>
        This event ended and was archived on {formatDateTime(event.archivedAt)}. Its media, venue
        details and messages were deleted; these facts are kept for history.
      </Notice>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Attendees" value={`${event.attendees}/${event.capacity}`} />
        <StatCard label="Chat messages" value={event.counts.chatMessages} />
        <StatCard label="Requests" value={event.counts.approved + event.counts.pending + event.counts.rejected + event.counts.removed} hint={`${event.counts.rejected} rejected · ${event.counts.removed} removed`} />
        <StatCard label="Reports" value={event.counts.reports} tone={event.counts.reports ? 'warning' : 'text'} />
      </div>
      <Card title="Details">
        <KeyValue
          items={[
            ['Host', <HostLink key="host" host={event.host} />],
            ['Category', event.category],
            ['Vibe', event.vibe],
            ['Visibility', event.visibility],
            ['Place', `${event.area}, ${event.city}${event.state ? `, ${event.state}` : ''}`],
            ['Starts', formatDateTime(event.startsAt)],
            ['Ends', formatDateTime(event.endsAt)],
            ['Ended by', event.completedBy],
            ['Media', `${event.counts.images} photos · ${event.counts.videos} videos`],
            ['Tags', event.tags?.length ? event.tags.join(', ') : '—'],
          ]}
        />
      </Card>
    </div>
  )
}

export default function EventDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useToast()
  const detail = useAdminQuery(`/events/${id}`)
  const [refreshKey, setRefreshKey] = useState(0)
  const audit = useAdminQuery(`/audit?targetType=event&targetId=${id}&pageSize=30`, refreshKey)
  const [dialog, setDialog] = useState(null)
  const [chat, setChat] = useState(null)
  const [chatReason, setChatReason] = useState('')

  if (detail.loading && !detail.data) return <Loading />
  if (detail.error && !detail.data) return <ErrorNotice error={detail.error} onRetry={detail.reload} />
  const { event, archived, people = [], media = [], reports = [] } = detail.data

  const refresh = () => {
    detail.reload()
    setRefreshKey((value) => value + 1)
  }

  async function readChat(reason) {
    const result = await adminRequest(`/events/${event.id}/chat${queryString({ reason })}`)
    setChat(result.messages)
    setChatReason(reason)
    setRefreshKey((value) => value + 1)
  }

  const isLive = !archived && event.status === 'live'

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
        <ArrowLeftIcon className="h-4 w-4" /> Back
      </button>

      <Card>
        <div className="flex flex-wrap items-start gap-4">
          {!archived && <Banner src={event.bannerImage} />}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight">{event.title}</h1>
              <StatusBadge status={event.status} />
              <Badge>{event.visibility}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted">
              Hosted by <HostLink host={event.host} />
              {event.host?.status && event.host.status !== 'active' && <> <StatusBadge status={event.host.status} /></>}
              {' '}· {formatDateTime(event.startsAt)} → {formatDateTime(event.endsAt)}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-2">{event.id}</p>
          </div>
          {!archived && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setDialog('chat')}>Read live chat</Button>
              {isLive && <Button size="sm" variant="danger-outline" onClick={() => setDialog('close')}>Close event</Button>}
            </div>
          )}
        </div>
      </Card>

      {archived ? <ArchivedEvent event={event} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Going" value={`${event.attendees}/${event.capacity}`} />
            <StatCard label="Pending requests" value={event.pendingRequests} tone={event.pendingRequests ? 'warning' : 'text'} />
            <StatCard label="Chat messages" value={event.chatMessages} />
            <StatCard label="Reports" value={event.reports} tone={event.reports ? 'danger' : 'text'} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Details">
              <KeyValue
                items={[
                  ['Category', event.category],
                  ['Vibe', event.vibe],
                  ['Area', `${event.area}, ${event.city}${event.state ? `, ${event.state}` : ''}`],
                  ['Venue', event.venueName ? `${event.venueName}${event.venueAddress ? ` — ${event.venueAddress}` : ''}` : event.venueAddress || '—'],
                  ['Landmark', event.landmark || '—'],
                  ['Map', event.coordinates
                    ? <a key="map" className="text-mint hover:underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${event.coordinates[0]}&mlon=${event.coordinates[1]}#map=16/${event.coordinates[0]}/${event.coordinates[1]}`}>{event.coordinates.join(', ')}</a>
                    : '—'],
                  ['Requests close', `${event.requestCutoffMinutes} min before start`],
                  ['Food & drinks', [event.food && `Food (${event.food})`, event.beverages && 'Beverages', event.drinks && 'Drinks'].filter(Boolean).join(', ') || 'None'],
                  ['Who can join', `${event.attendeePreference} · ${event.experienceLevel}`],
                  ['Tags', event.tags?.length ? event.tags.join(', ') : '—'],
                ]}
              />
            </Card>
            <Card title="Description">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{event.description}</p>
            </Card>
          </div>

          <Card title="Requests and attendees" padded={false}>
            <DataTable
              rows={people}
              rowKey="requestId"
              empty="No one has asked to join yet."
              onRowClick={(row) => navigate(`/admin/users/${row.user.id}`)}
              columns={[
                {
                  key: 'user',
                  header: 'Person',
                  render: (row) => (
                    <span className="font-semibold">
                      {row.user.name}
                      {row.user.status !== 'active' && <> <StatusBadge status={row.user.status} /></>}
                    </span>
                  ),
                },
                { key: 'status', header: 'Request', render: (row) => <StatusBadge status={row.status} /> },
                { key: 'requestedAt', header: 'Asked', render: (row) => formatRelative(row.requestedAt) },
                { key: 'reviewedAt', header: 'Reviewed', render: (row) => (row.reviewedAt ? formatRelative(row.reviewedAt) : '—') },
              ]}
            />
          </Card>

          <Card title={`Venue media (${media.length})`}>
            {!media.length && <EmptyState title="The host didn't upload photos or videos." />}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {media.map((item) => (
                <figure key={item.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                  {item.kind === 'image'
                    ? <img src={adminUrl(`/events/${event.id}/media/${item.id}`)} alt={item.name} className="aspect-video w-full object-cover" />
                    : <video src={adminUrl(`/events/${event.id}/media/${item.id}`)} controls preload="metadata" className="aspect-video w-full bg-black" />}
                  <figcaption className="flex items-center justify-between gap-2 p-2.5 text-xs">
                    <span className="truncate text-muted" title={item.name}>{item.name} · {formatBytes(item.bytes)}</span>
                    <Button size="sm" variant="danger-outline" onClick={() => setDialog({ type: 'media', item })}>Remove</Button>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Card>

          {chat && (
            <Card
              title={`Live chat (last 24 hours · ${chat.length} messages)`}
              actions={<Button size="sm" variant="ghost" onClick={() => setChat(null)}>Hide</Button>}
            >
              <p className="mb-3 text-xs text-muted">Opened for: “{chatReason}”. This view was recorded in the audit log.</p>
              {!chat.length && <p className="text-sm text-muted">No messages in the last 24 hours.</p>}
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto">
                {chat.map((message) => (
                  <li key={message.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">
                        <Link to={`/admin/users/${message.sender.id}`} className="font-semibold text-text hover:text-mint">{message.sender.name}</Link>
                        {' '}· {formatDateTime(message.createdAt)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{message.text}</p>
                    </div>
                    <Button size="sm" variant="danger-outline" onClick={() => setDialog({ type: 'message', message })}>Delete</Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {reports.length > 0 && (
            <Card title="Reports from this event's chat" padded={false}>
              <DataTable
                rows={reports}
                onRowClick={(row) => navigate(`/admin/reports/${row.id}`)}
                columns={[
                  { key: 'reason', header: 'Reason', render: (row) => <Badge tone={row.reason === 'safety' ? 'danger' : 'neutral'}>{row.reason}</Badge> },
                  { key: 'reportedName', header: 'Reported' },
                  { key: 'snapshot', header: 'Message', render: (row) => <span className="line-clamp-2 max-w-md text-xs">{row.snapshot}</span> },
                  { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                ]}
              />
            </Card>
          )}
        </>
      )}

      <Card title="Admin actions on this event" padded={false}>
        <ErrorNotice error={audit.error} />
        <AuditList entries={audit.data?.items} />
      </Card>

      <ConfirmDialog
        open={dialog === 'close'}
        title="Close this event"
        description="The event ends now and disappears from Home and Explore. The host and every approved attendee get a notification, and the live chat closes."
        reason
        reasonLabel="Reason (shown to the host)"
        confirmLabel="Close event"
        tone="danger"
        onClose={() => setDialog(null)}
        onConfirm={async ({ reason }) => {
          const result = await adminRequest(`/events/${event.id}/close`, { method: 'POST', body: { reason } })
          notify(result.message)
          refresh()
        }}
      />

      <ConfirmDialog
        open={dialog === 'chat'}
        title="Read this event's live chat"
        description="Event chats are private to the host and attendees. Only open one to investigate a problem; your reason and this view are saved in the audit log."
        reason
        reasonLabel="Why do you need to read it?"
        confirmLabel="Open chat"
        onClose={() => setDialog(null)}
        onConfirm={({ reason }) => readChat(reason)}
      />

      <ConfirmDialog
        open={dialog?.type === 'media'}
        title="Remove this media"
        description="It is deleted for everyone and the host is told it broke the community guidelines."
        reason
        confirmLabel="Remove"
        tone="danger"
        onClose={() => setDialog(null)}
        onConfirm={async ({ reason }) => {
          await adminRequest(`/events/${event.id}/media/${dialog.item.id}`, { method: 'DELETE', body: { reason } })
          notify('Media removed.')
          refresh()
        }}
      />

      <ConfirmDialog
        open={dialog?.type === 'message'}
        title="Delete this message"
        description={dialog?.message ? `“${dialog.message.text.slice(0, 160)}” from ${dialog.message.sender.name}. The text is kept in the audit log.` : ''}
        reason
        confirmLabel="Delete message"
        tone="danger"
        onClose={() => setDialog(null)}
        onConfirm={async ({ reason }) => {
          await adminRequest(`/events/${event.id}/chat/${dialog.message.id}`, { method: 'DELETE', body: { reason } })
          notify('Message deleted.')
          setChat((current) => current?.filter((message) => message.id !== dialog.message.id) ?? null)
          refresh()
        }}
      />
    </div>
  )
}
