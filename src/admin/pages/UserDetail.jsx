import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftIcon } from '../../components/NavIcons'
import { adminRequest, adminUrl } from '../adminApi'
import { formatDate, formatDateTime, formatNumber, formatRelative } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import AuditList from '../components/AuditList'
import { useToast } from '../components/Toast'
import { DownloadIcon } from '../components/icons'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DataTable,
  ErrorNotice,
  Field,
  Input,
  KeyValue,
  Loading,
  Notice,
  Pagination,
  StatCard,
  StatusBadge,
  Tabs,
  Textarea,
} from '../components/ui'

const PROFILE_FIELDS = [
  ['name', 'Name (resets to “Spontii user”)'],
  ['photo', 'Profile photo'],
  ['tagline', 'Tagline'],
  ['bio', 'Bio'],
  ['city', 'City'],
  ['tags', 'Tags'],
]
const DAY = 24 * 60 * 60 * 1000

function localInputValue(date) {
  const offset = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function Ledger({ userId, refreshKey }) {
  const [page, setPage] = useState(1)
  const ledger = useAdminQuery(`/users/${userId}/points-ledger?page=${page}`, refreshKey)
  return (
    <>
      <ErrorNotice error={ledger.error} />
      <DataTable
        loading={ledger.loading}
        rows={ledger.data?.items || []}
        empty="No points activity yet."
        columns={[
          { key: 'createdAt', header: 'When', render: (row) => formatDateTime(row.createdAt) },
          { key: 'source', header: 'Source', render: (row) => <Badge>{row.source.replace('_', ' ')}</Badge> },
          {
            key: 'delta',
            header: 'Change',
            className: 'text-right tabular-nums',
            render: (row) => <span className={row.delta >= 0 ? 'text-mint' : 'text-danger'}>{row.delta > 0 ? '+' : ''}{row.delta}</span>,
          },
          { key: 'balanceAfter', header: 'Balance', className: 'text-right tabular-nums' },
          { key: 'reason', header: 'Reason', render: (row) => <span className="text-muted">{row.reason}{row.adminName ? ` · by ${row.adminName}` : ''}</span> },
        ]}
      />
      {ledger.data && <Pagination page={ledger.data.page} totalPages={ledger.data.totalPages} total={ledger.data.total} onPage={setPage} />}
    </>
  )
}

function Logins({ userId }) {
  const logins = useAdminQuery(`/users/${userId}/login-history`)
  return (
    <>
      <ErrorNotice error={logins.error} />
      <DataTable
        loading={logins.loading}
        rows={logins.data?.logins || []}
        empty="No logins recorded yet."
        columns={[
          { key: 'createdAt', header: 'When', render: (row) => formatDateTime(row.createdAt) },
          { key: 'method', header: 'Method', render: (row) => <Badge>{row.method === 'otp' ? 'email code' : 'password'}</Badge> },
          { key: 'ip', header: 'IP', render: (row) => <span className="font-mono text-xs">{row.ip || '—'}</span> },
          { key: 'userAgent', header: 'Browser', render: (row) => <span className="line-clamp-1 max-w-md text-xs text-muted">{row.userAgent}</span> },
        ]}
      />
    </>
  )
}

function Notes({ userId }) {
  const notify = useToast()
  const notes = useAdminQuery(`/users/${userId}/notes`)
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function add(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await adminRequest(`/users/${userId}/notes`, { method: 'POST', body: { note: text } })
      setText('')
      notify('Note saved.')
      notes.reload()
    } catch (addError) {
      setError(addError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 p-5">
      <form onSubmit={add} className="space-y-2">
        <Textarea aria-label="New note" placeholder="Private note for the Spontii team (the user never sees this)" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} />
        <ErrorNotice error={error} />
        <Button type="submit" size="sm" variant="primary" disabled={busy || !text.trim()}>Add note</Button>
      </form>
      <ErrorNotice error={notes.error} />
      <ul className="space-y-3">
        {(notes.data?.notes || []).map((note) => (
          <li key={note.id} className="rounded-xl border border-border bg-surface p-3">
            <p className="whitespace-pre-wrap text-sm">{note.note}</p>
            <p className="mt-1.5 text-xs text-muted">{note.adminName || 'Admin'} · {formatDateTime(note.createdAt)}</p>
          </li>
        ))}
      </ul>
      {notes.data && !notes.data.notes.length && <p className="text-sm text-muted">No notes yet.</p>}
    </div>
  )
}

function UserAudit({ userId, refreshKey }) {
  const audit = useAdminQuery(`/audit?targetType=user&targetId=${userId}&pageSize=50`, refreshKey)
  return (
    <>
      <div className="px-5"><ErrorNotice error={audit.error} /></div>
      {audit.loading && !audit.data ? <Loading /> : <AuditList entries={audit.data?.items} />}
    </>
  )
}

export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const notify = useToast()
  const detail = useAdminQuery(`/users/${id}`)
  const [dialog, setDialog] = useState(null)
  const [tab, setTab] = useState('ledger')
  const [refreshKey, setRefreshKey] = useState(0)
  const [suspendUntil, setSuspendUntil] = useState('')
  const [pointsDelta, setPointsDelta] = useState('')
  const [moderateFields, setModerateFields] = useState([])
  const [blockIdentity, setBlockIdentity] = useState(false)

  if (detail.loading && !detail.data) return <Loading />
  if (detail.error && !detail.data) return <ErrorNotice error={detail.error} onRetry={detail.reload} />
  const { user, hostedEvents, archivedEvents, reportsAgainst } = detail.data

  async function run(path, method, body, message) {
    await adminRequest(path, { method, body })
    notify(message)
    detail.reload()
    setRefreshKey((value) => value + 1)
  }

  function open(name) {
    if (name === 'suspend') setSuspendUntil(localInputValue(new Date(Date.now() + 7 * DAY)))
    if (name === 'points') setPointsDelta('')
    if (name === 'moderate') setModerateFields([])
    if (name === 'delete') setBlockIdentity(user.status === 'banned')
    setDialog(name)
  }
  const close = () => setDialog(null)

  const isActive = user.status === 'active'

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
        <ArrowLeftIcon className="h-4 w-4" /> All users
      </Link>

      <Card>
        <div className="flex flex-wrap items-start gap-5">
          <Avatar src={user.hasPhoto ? adminUrl(`/users/${user.id}/photo`) : null} name={user.name} size="h-20 w-20" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight">{user.name}</h1>
              <StatusBadge status={user.status} />
              {user.verified && <Badge tone="mint">Spontii Verified</Badge>}
              {user.warnings > 0 && <Badge tone="warning">{user.warnings} warning{user.warnings > 1 ? 's' : ''}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {user.email} · {user.phone} · <span className="font-mono">{user.spontiiiId}</span>
            </p>
            <p className="mt-1 text-xs text-muted-2">
              Joined {formatDate(user.createdAt)} · last active {formatRelative(user.lastSeenAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isActive ? (
              <>
                <Button size="sm" onClick={() => open('warn')}>Warn</Button>
                <Button size="sm" variant="danger-outline" onClick={() => open('suspend')}>Suspend</Button>
                <Button size="sm" variant="danger-outline" onClick={() => open('ban')}>Ban</Button>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={() => open('reactivate')}>Reactivate</Button>
            )}
            <Button size="sm" onClick={() => open('logout')}>Sign out everywhere</Button>
          </div>
        </div>

        {!isActive && (
          <div className="mt-5">
            <Notice tone={user.status === 'banned' ? 'danger' : 'warning'}>
              <strong className="capitalize">{user.status}</strong>
              {user.suspendedUntil && ` until ${formatDateTime(user.suspendedUntil)}`}
              {user.statusReason && ` — ${user.statusReason}`}
            </Notice>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">
          <Button size="sm" onClick={() => open('points')}>Adjust points</Button>
          <Button size="sm" onClick={() => open(user.verified ? 'unverify' : 'verify')}>
            {user.verified ? 'Remove Spontii Verified' : 'Mark Spontii Verified'}
          </Button>
          <Button size="sm" onClick={() => open('moderate')}>Remove profile content</Button>
          <a
            href={adminUrl(`/users/${user.id}/export`)}
            className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-xs font-bold hover:border-mint/40 hover:text-mint"
          >
            <DownloadIcon className="h-3.5 w-3.5" /> Export data
          </a>
          <Button size="sm" variant="danger-outline" className="ml-auto" onClick={() => open('delete')}>Delete account</Button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Points" value={formatNumber(user.points)} tone="mint" />
        <StatCard label="Score" value={formatNumber(user.score)} />
        <StatCard label="Events created" value={formatNumber(user.activitiesCreated)} />
        <StatCard label="Friends" value={formatNumber(user.counts.friends)} />
        <StatCard label="Reports against" value={formatNumber(user.counts.reportsAgainst)} hint={`${user.counts.openReportsAgainst} open`} tone={user.counts.openReportsAgainst ? 'warning' : 'text'} />
        <StatCard label="Logins" value={formatNumber(user.counts.logins)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <KeyValue
            items={[
              ['City', user.city || '—'],
              ['Tagline', user.tagline || '—'],
              ['Bio', user.bio || '—'],
              ['Tags', user.tags.length ? user.tags.join(', ') : '—'],
              ['Events joined (live)', user.counts.eventsJoined],
              ['Blocks', `${user.counts.blocksGiven} given · ${user.counts.blocksReceived} received`],
              ['Reports filed', user.counts.reportsFiled],
              ['Last daily claim', user.lastDailyClaim || 'never'],
            ]}
          />
        </Card>
        <Card title="Reports against this user" padded={false}>
          <DataTable
            rows={reportsAgainst}
            empty="No one has reported this user."
            onRowClick={(row) => navigate(`/admin/reports/${row.id}`)}
            columns={[
              { key: 'reason', header: 'Reason', render: (row) => <Badge tone={row.reason === 'safety' ? 'danger' : 'neutral'}>{row.reason}</Badge> },
              { key: 'snapshot', header: 'Message', render: (row) => <span className="line-clamp-2 max-w-xs text-xs">{row.snapshot}</span> },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
              { key: 'createdAt', header: 'When', render: (row) => formatRelative(row.createdAt) },
            ]}
          />
        </Card>
      </div>

      <Card title="Hosted events" padded={false}>
        <DataTable
          rows={[
            ...hostedEvents,
            ...archivedEvents.map((event) => ({ ...event, status: 'archived', visibility: '—' })),
          ]}
          empty="This user hasn't hosted any events."
          onRowClick={(row) => navigate(`/admin/events/${row.id}`)}
          columns={[
            { key: 'title', header: 'Event', render: (row) => <span className="font-semibold">{row.title}</span> },
            { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
            { key: 'visibility', header: 'Visibility' },
            { key: 'startsAt', header: 'Starts', render: (row) => formatDateTime(row.startsAt) },
            { key: 'completedBy', header: 'Closed by', render: (row) => row.completedBy || '—' },
          ]}
        />
      </Card>

      <Card padded={false}>
        <div className="p-4">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'ledger', label: 'Points ledger' },
              { value: 'logins', label: 'Login history' },
              { value: 'notes', label: 'Admin notes' },
              { value: 'audit', label: 'Audit trail' },
            ]}
          />
        </div>
        {tab === 'ledger' && <Ledger userId={user.id} refreshKey={refreshKey} />}
        {tab === 'logins' && <Logins userId={user.id} />}
        {tab === 'notes' && <Notes userId={user.id} />}
        {tab === 'audit' && <UserAudit userId={user.id} refreshKey={refreshKey} />}
      </Card>

      <ConfirmDialog
        open={dialog === 'warn'}
        title={`Warn ${user.name}`}
        description="The user gets a notification with your message. Warnings are counted on their record."
        reason
        reasonLabel="Message shown to the user"
        confirmLabel="Send warning"
        onClose={close}
        onConfirm={({ reason }) => run(`/users/${user.id}/warn`, 'POST', { reason }, 'Warning sent.')}
      />

      <ConfirmDialog
        open={dialog === 'suspend'}
        title={`Suspend ${user.name}`}
        description="They are signed out everywhere and can't log in until the suspension ends. Their profile and events are hidden meanwhile."
        reason
        reasonLabel="Reason (shown to the user)"
        confirmLabel="Suspend"
        tone="danger"
        onClose={close}
        onConfirm={({ reason }) => run(
          `/users/${user.id}/status`,
          'PATCH',
          { status: 'suspended', reason, until: new Date(suspendUntil).toISOString() },
          'User suspended.',
        )}
      >
        <Field label="Suspended until" htmlFor="suspend-until">
          <Input id="suspend-until" type="datetime-local" value={suspendUntil} onChange={(event) => setSuspendUntil(event.target.value)} required />
        </Field>
        <div className="flex gap-2">
          {[1, 7, 30].map((days) => (
            <Button key={days} size="sm" onClick={() => setSuspendUntil(localInputValue(new Date(Date.now() + days * DAY)))}>
              {days} day{days > 1 ? 's' : ''}
            </Button>
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'ban'}
        title={`Ban ${user.name}`}
        description="Bans are open-ended. The user is signed out, can't log in, disappears from search, and their live events are closed with attendees notified."
        reason
        reasonLabel="Reason (shown to the user)"
        confirmLabel="Ban user"
        tone="danger"
        onClose={close}
        onConfirm={({ reason }) => run(`/users/${user.id}/status`, 'PATCH', { status: 'banned', reason }, 'User banned.')}
      />

      <ConfirmDialog
        open={dialog === 'reactivate'}
        title={`Reactivate ${user.name}`}
        description="They can log in again straight away. Events closed by a ban stay closed."
        reason
        confirmLabel="Reactivate"
        onClose={close}
        onConfirm={({ reason }) => run(`/users/${user.id}/status`, 'PATCH', { status: 'active', reason }, 'User reactivated.')}
      />

      <ConfirmDialog
        open={dialog === 'logout'}
        title="Sign out everywhere"
        description="Every device the user is logged in on is signed out now. They can log back in with their password."
        confirmLabel="Sign out"
        onClose={close}
        onConfirm={() => run(`/users/${user.id}/force-logout`, 'POST', undefined, 'User signed out everywhere.')}
      />

      <ConfirmDialog
        open={dialog === 'points'}
        title="Adjust Spontii points"
        description={`Current balance: ${formatNumber(user.points)}. Use a negative number to remove points; the balance never goes below 0.`}
        reason
        confirmLabel="Apply"
        onClose={close}
        onConfirm={({ reason }) => run(
          `/users/${user.id}/points`,
          'POST',
          { delta: Number(pointsDelta), reason },
          'Points updated.',
        )}
      >
        <Field label="Points to add (or remove with −)" htmlFor="points-delta">
          <Input id="points-delta" type="number" step="1" value={pointsDelta} onChange={(event) => setPointsDelta(event.target.value)} required />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'verify' || dialog === 'unverify'}
        title={dialog === 'verify' ? 'Mark as Spontii Verified' : 'Remove Spontii Verified'}
        description={dialog === 'verify'
          ? 'A verified badge appears on their profile and events. They get a notification.'
          : 'The badge disappears from their profile and events.'}
        confirmLabel={dialog === 'verify' ? 'Verify' : 'Remove badge'}
        onClose={close}
        onConfirm={() => run(`/users/${user.id}/verified`, 'PATCH', { verified: dialog === 'verify' }, 'Verification updated.')}
      />

      <ConfirmDialog
        open={dialog === 'moderate'}
        title="Remove profile content"
        description="Selected fields are cleared and the user is told something broke the community guidelines. The removed text is kept in the audit log."
        reason
        confirmLabel={`Remove ${moderateFields.length || ''} field${moderateFields.length === 1 ? '' : 's'}`}
        tone="danger"
        onClose={close}
        onConfirm={({ reason }) => {
          if (!moderateFields.length) throw new Error('Choose at least one field.')
          return run(`/users/${user.id}/moderate-profile`, 'PATCH', { fields: moderateFields, reason }, 'Profile content removed.')
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {PROFILE_FIELDS.map(([field, label]) => (
            <Checkbox
              key={field}
              label={label}
              checked={moderateFields.includes(field)}
              onChange={(checked) => setModerateFields((current) =>
                checked ? [...current, field] : current.filter((item) => item !== field))}
            />
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'delete'}
        title={`Delete ${user.name}'s account`}
        description="This permanently deletes the account with its events, requests, messages, friendships and notifications. It can't be undone. The audit log keeps who they were."
        reason
        confirmText={user.email}
        confirmLabel="Delete forever"
        tone="danger"
        onClose={close}
        onConfirm={async ({ reason }) => {
          await adminRequest(`/users/${user.id}`, {
            method: 'DELETE',
            body: { confirmEmail: user.email, reason, blockIdentity },
          })
          notify('Account deleted.')
          navigate('/admin/users', { replace: true })
        }}
      >
        <Checkbox
          label="Block this email and phone from signing up again"
          description="Adds both to the blocklist in Settings."
          checked={blockIdentity}
          onChange={setBlockIdentity}
        />
      </ConfirmDialog>
    </div>
  )
}
