import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../AdminAuthContext'
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
  Notice,
  PageHeader,
} from '../components/ui'

function PasswordForm({ forced }) {
  const { admin, changePassword } = useAdminAuth()
  const navigate = useNavigate()
  const notify = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (next !== confirm) {
      setError(new Error('The new passwords do not match.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await changePassword(current, next)
      notify(result.message)
      setCurrent('')
      setNext('')
      setConfirm('')
      if (forced) navigate('/admin', { replace: true })
    } catch (changeError) {
      setError(changeError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="email" value={admin?.email || ''} autoComplete="username" readOnly hidden />
      <Field label="Current password" htmlFor="current-password">
        <Input id="current-password" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="new-password" hint="At least 12 characters, mixing three of: lowercase, uppercase, numbers, symbols.">
        <Input id="new-password" type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" minLength={12} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm-password">
        <Input id="confirm-password" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required />
      </Field>
      <ErrorNotice error={error} />
      <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button>
    </form>
  )
}

function Sessions() {
  const notify = useToast()
  const sessions = useAdminQuery('/auth/sessions')
  const [error, setError] = useState(null)

  async function revoke(session) {
    setError(null)
    try {
      await adminRequest(`/auth/sessions/${session.id}`, { method: 'DELETE' })
      notify('Session signed out.')
      if (session.current) window.location.assign('/admin/login')
      else sessions.reload()
    } catch (revokeError) {
      setError(revokeError)
    }
  }

  return (
    <Card title="Active sessions" padded={false}>
      <div className="px-5"><ErrorNotice error={error || sessions.error} /></div>
      <DataTable
        loading={sessions.loading}
        rows={sessions.data?.sessions || []}
        columns={[
          {
            key: 'device',
            header: 'Device',
            render: (row) => (
              <div className="max-w-xs">
                <p className="truncate text-sm">{row.userAgent || 'Unknown browser'}</p>
                <p className="text-xs text-muted">{row.ip || 'Unknown IP'}</p>
              </div>
            ),
          },
          { key: 'createdAt', header: 'Signed in', render: (row) => formatDateTime(row.createdAt) },
          { key: 'lastSeenAt', header: 'Last active', render: (row) => formatRelative(row.lastSeenAt) },
          {
            key: 'actions',
            header: '',
            className: 'text-right',
            render: (row) => (
              <div className="flex items-center justify-end gap-2">
                {row.current && <Badge tone="mint">This device</Badge>}
                <Button size="sm" variant="danger-outline" onClick={() => revoke(row)}>Sign out</Button>
              </div>
            ),
          },
        ]}
      />
    </Card>
  )
}

export default function Account() {
  const { admin } = useAdminAuth()
  const forced = Boolean(admin?.mustChangePassword)

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Account" title="Your admin account" description="Your sign-in details and the devices signed in as you." />
      {forced && (
        <Notice tone="warning">
          Set a new password before using the admin portal. The one you signed in with was a starting
          password from the server configuration.
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <KeyValue
            items={[
              ['Name', admin?.name],
              ['Email', admin?.email],
              ['Role', 'Super admin'],
              ['Last sign-in', formatDateTime(admin?.lastLoginAt)],
            ]}
          />
        </Card>
        <Card title={forced ? 'Set a new password' : 'Change password'}>
          <PasswordForm forced={forced} />
        </Card>
      </div>
      {!forced && <Sessions />}
    </div>
  )
}
