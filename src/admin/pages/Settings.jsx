import { useState } from 'react'
import { adminRequest } from '../adminApi'
import { formatDateTime, formatRelative } from '../format'
import { useAdminQuery } from '../useAdminQuery'
import { useToast } from '../components/Toast'
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  DataTable,
  ErrorNotice,
  Field,
  Input,
  Loading,
  Notice,
  PageHeader,
  Pagination,
  Select,
  Textarea,
} from '../components/ui'

const ECONOMY = [
  ['daily_claim_points', 'Daily claim', 'Points a user can claim once a day.'],
  ['event_required_base', 'Points needed for the first event', 'Users need this balance to publish their first event. Points are not spent.'],
  ['event_required_step', 'Extra points per later event', 'Added to the requirement for each event the user has already created.'],
  ['event_award_points', 'Points earned per event', 'Awarded when a user publishes an event.'],
]
const SWITCHES = [
  ['signups_enabled', 'New sign-ups', 'Turn off to stop new accounts (existing users can still log in).'],
  ['event_creation_enabled', 'Creating events', 'Turn off to stop anyone publishing new events.'],
  ['dms_enabled', 'Direct messages', 'Turn off to pause all DMs. Event live chats keep working.'],
]

function SettingsForm({ initial, changes, onSaved }) {
  const notify = useToast()
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(false)

  const changed = Object.keys(draft).filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(initial[key]))
  const set = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  const turningOnMaintenance = draft.maintenance.enabled && !initial.maintenance.enabled

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const settings = Object.fromEntries(changed.map((key) => [key, draft[key]]))
      const result = await adminRequest('/settings', { method: 'PATCH', body: { settings } })
      notify('Settings saved. They apply to the app right away.')
      onSaved(result.settings)
    } catch (saveError) {
      setError(saveError)
    } finally {
      setBusy(false)
    }
  }

  const lastChange = (key) => (changes[key] ? `Changed ${formatRelative(changes[key].at)}${changes[key].by ? ` by ${changes[key].by}` : ''}` : 'Default')

  return (
    <div className="space-y-6">
      <Card title="Points economy">
        <div className="grid gap-5 md:grid-cols-2">
          {ECONOMY.map(([key, label, hint]) => (
            <Field key={key} label={label} htmlFor={key} hint={`${hint} ${lastChange(key)}.`}>
              <Input
                id={key}
                type="number"
                min="0"
                step="1"
                value={draft[key]}
                onChange={(event) => set(key, event.target.value === '' ? '' : Number(event.target.value))}
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Feature switches">
        <div className="space-y-4">
          {SWITCHES.map(([key, label, hint]) => (
            <Checkbox key={key} label={label} description={`${hint} ${lastChange(key)}.`} checked={draft[key]} onChange={(value) => set(key, value)} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Maintenance mode">
          <div className="space-y-4">
            <Checkbox
              label="Show the maintenance screen"
              description="Everyone using the app sees a maintenance page and the user API answers 503. This admin portal keeps working."
              checked={draft.maintenance.enabled}
              onChange={(value) => set('maintenance', { ...draft.maintenance, enabled: value })}
            />
            <Field label="Message on the maintenance screen" htmlFor="maintenance-message">
              <Textarea
                id="maintenance-message"
                value={draft.maintenance.message}
                maxLength={300}
                placeholder="We're upgrading Spontii. Back in about 30 minutes."
                onChange={(event) => set('maintenance', { ...draft.maintenance, message: event.target.value })}
              />
            </Field>
            <p className="text-xs text-muted-2">{lastChange('maintenance')}.</p>
          </div>
        </Card>

        <Card title="Site-wide banner">
          <div className="space-y-4">
            <Checkbox
              label="Show a banner at the top of the app"
              description="For news or planned downtime. People can dismiss it."
              checked={draft.site_banner.enabled}
              onChange={(value) => set('site_banner', { ...draft.site_banner, enabled: value })}
            />
            <Field label="Style" htmlFor="banner-level">
              <Select id="banner-level" value={draft.site_banner.level} onChange={(event) => set('site_banner', { ...draft.site_banner, level: event.target.value })}>
                <option value="info">Info (mint)</option>
                <option value="warning">Warning (orange)</option>
              </Select>
            </Field>
            <Field label="Banner text" htmlFor="banner-message">
              <Textarea
                id="banner-message"
                value={draft.site_banner.message}
                maxLength={300}
                onChange={(event) => set('site_banner', { ...draft.site_banner, message: event.target.value })}
              />
            </Field>
            <p className="text-xs text-muted-2">{lastChange('site_banner')}.</p>
          </div>
        </Card>
      </div>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-border bg-surface-2 p-4">
        <ErrorNotice error={error} />
        <span className="mr-auto text-sm text-muted">
          {changed.length ? `${changed.length} unsaved change${changed.length > 1 ? 's' : ''}` : 'No unsaved changes'}
        </span>
        <Button variant="ghost" disabled={!changed.length || busy} onClick={() => setDraft(initial)}>Discard</Button>
        <Button
          variant={turningOnMaintenance ? 'danger' : 'primary'}
          disabled={!changed.length || busy}
          onClick={() => (turningOnMaintenance ? setConfirm(true) : save())}
        >
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Turn on maintenance mode?"
        description="Everyone using Spontii is shown the maintenance screen within a minute, and actions they're in the middle of will fail. Turn it off here when you're done."
        confirmLabel="Turn on maintenance"
        tone="danger"
        onClose={() => setConfirm(false)}
        onConfirm={save}
      />
    </div>
  )
}

function Blocklist() {
  const notify = useToast()
  const [page, setPage] = useState(1)
  const list = useAdminQuery(`/blocklist?page=${page}`)
  const [kind, setKind] = useState('email')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)

  async function add(event) {
    event.preventDefault()
    setError(null)
    try {
      await adminRequest('/blocklist', { method: 'POST', body: { kind, value, reason } })
      notify('Added to the blocklist.')
      setValue('')
      setReason('')
      list.reload()
    } catch (addError) {
      setError(addError)
    }
  }

  async function remove(row) {
    try {
      await adminRequest(`/blocklist/${row.id}`, { method: 'DELETE' })
      notify('Removed from the blocklist.')
      list.reload()
    } catch (removeError) {
      setError(removeError)
    }
  }

  return (
    <Card title="Sign-up blocklist" padded={false}>
      <form onSubmit={add} className="grid gap-3 border-b border-border p-5 md:grid-cols-[140px_1fr_1fr_auto]">
        <Select aria-label="Type" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
        </Select>
        <Input aria-label="Email or phone" placeholder={kind === 'email' ? 'person@example.com' : '+919876543210'} value={value} onChange={(event) => setValue(event.target.value)} required />
        <Input aria-label="Reason" placeholder="Reason (optional)" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} />
        <Button type="submit" variant="primary">Block</Button>
        <div className="md:col-span-4"><ErrorNotice error={error || list.error} /></div>
      </form>
      <DataTable
        loading={list.loading}
        rows={list.data?.items || []}
        empty="No one is blocked from signing up."
        columns={[
          { key: 'kind', header: 'Type' },
          { key: 'value', header: 'Value', render: (row) => <span className="font-mono text-xs">{row.value}</span> },
          { key: 'reason', header: 'Reason', render: (row) => row.reason || '—' },
          { key: 'createdAt', header: 'Added', render: (row) => `${formatDateTime(row.createdAt)}${row.adminName ? ` · ${row.adminName}` : ''}` },
          { key: 'actions', header: '', className: 'text-right', render: (row) => <Button size="sm" variant="ghost" onClick={() => remove(row)}>Unblock</Button> },
        ]}
      />
      {list.data && <Pagination page={list.data.page} totalPages={list.data.totalPages} total={list.data.total} onPage={setPage} />}
    </Card>
  )
}

export default function Settings() {
  const settings = useAdminQuery('/settings')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Settings"
        description="Change how Spontii behaves without a deploy. Every change is saved in the audit log."
      />
      {settings.error && <ErrorNotice error={settings.error} onRetry={settings.reload} />}
      {!settings.data ? <Loading /> : (
        <>
          {settings.data.settings.maintenance.enabled && (
            <Notice tone="danger">Maintenance mode is ON. People using the app see the maintenance screen.</Notice>
          )}
          <SettingsForm
            key={JSON.stringify(settings.data.settings)}
            initial={settings.data.settings}
            changes={settings.data.changes}
            onSaved={settings.reload}
          />
        </>
      )}
      <Blocklist />
    </div>
  )
}
