import { useState } from 'react'
import { useAdminAuth } from '../AdminAuthContext'
import { adminRequest } from '../adminApi'
import { formatDateTime, formatRelative } from '../format'
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
  Modal,
  Notice,
  PageHeader,
  StatusBadge,
} from '../components/ui'

function TemporaryPassword({ result, onClose }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal open={Boolean(result)} title={result?.title || ''} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <p className="text-sm text-muted">{result?.message}</p>
      <div className="mt-4 flex items-center gap-2">
        <code className="flex-1 select-all rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-sm">{result?.temporaryPassword}</code>
        <Button
          size="sm"
          onClick={async () => {
            await navigator.clipboard?.writeText(result.temporaryPassword)
            setCopied(true)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="mt-3 text-xs text-muted-2">They sign in at /admin with this password and an email code, then must choose a new password.</p>
    </Modal>
  )
}

export default function Admins() {
  const { admin: me } = useAdminAuth()
  const notify = useToast()
  const admins = useAdminQuery('/admins')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [dialog, setDialog] = useState(null)
  const [secret, setSecret] = useState(null)

  async function create(event) {
    event.preventDefault()
    setError(null)
    try {
      const result = await adminRequest('/admins', { method: 'POST', body: { email, name } })
      setSecret({ ...result, title: `Admin created for ${email}` })
      setEmail('')
      setName('')
      admins.reload()
    } catch (createError) {
      setError(createError)
    }
  }

  const target = dialog?.admin

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Team"
        title="Admins"
        description="Everyone who can sign in to this portal. All admins are super admins: they can do everything here, including managing other admins."
      />

      <Card title="Add an admin">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Full name" htmlFor="admin-name">
            <Input id="admin-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
          </Field>
          <Field label="Work email" htmlFor="admin-new-email">
            <Input id="admin-new-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </Field>
          <Button type="submit" variant="primary">Create admin</Button>
        </form>
        <div className="mt-3"><ErrorNotice error={error} /></div>
        <p className="mt-2 text-xs text-muted-2">A temporary password is shown once. Share it privately; their login also needs a code sent to that email.</p>
      </Card>

      <Card padded={false}>
        {admins.error && <div className="p-4"><ErrorNotice error={admins.error} onRetry={admins.reload} /></div>}
        <DataTable
          loading={admins.loading}
          rows={admins.data?.admins || []}
          columns={[
            {
              key: 'name',
              header: 'Admin',
              render: (row) => (
                <div>
                  <p className="font-semibold">{row.name} {row.id === me?.id && <Badge tone="mint">You</Badge>}</p>
                  <p className="text-xs text-muted">{row.email}</p>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <div className="flex flex-wrap gap-1.5">
                  <StatusBadge status={row.status} />
                  {row.locked && <Badge tone="warning">locked</Badge>}
                  {row.mustChangePassword && <Badge>temporary password</Badge>}
                </div>
              ),
            },
            { key: 'lastLoginAt', header: 'Last sign-in', render: (row) => formatRelative(row.lastLoginAt) },
            { key: 'sessions', header: 'Sessions', className: 'text-right tabular-nums' },
            { key: 'createdAt', header: 'Added', render: (row) => `${formatDateTime(row.createdAt)}${row.createdBy ? ` · by ${row.createdBy}` : ''}` },
            {
              key: 'actions',
              header: '',
              className: 'text-right',
              render: (row) => row.id === me?.id ? <span className="text-xs text-muted">Manage in Account</span> : (
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={() => setDialog({ type: 'reset', admin: row })}>Reset password</Button>
                  {row.sessions > 0 && <Button size="sm" onClick={() => setDialog({ type: 'sessions', admin: row })}>Sign out</Button>}
                  {row.status === 'active'
                    ? <Button size="sm" variant="danger-outline" onClick={() => setDialog({ type: 'disable', admin: row })}>Disable</Button>
                    : <Button size="sm" variant="primary" onClick={() => setDialog({ type: 'enable', admin: row })}>Enable</Button>}
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Notice>
        Locked out of the only admin account? On the server run <code className="font-mono">npm run admin -- reset-password &lt;email&gt;</code>.
      </Notice>

      <ConfirmDialog
        open={dialog?.type === 'disable' || dialog?.type === 'enable'}
        title={dialog?.type === 'disable' ? `Disable ${target?.name}?` : `Enable ${target?.name}?`}
        description={dialog?.type === 'disable'
          ? 'They are signed out at once and can no longer sign in. You can enable them again later.'
          : 'They can sign in again with their current password.'}
        confirmLabel={dialog?.type === 'disable' ? 'Disable' : 'Enable'}
        tone={dialog?.type === 'disable' ? 'danger' : 'primary'}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const result = await adminRequest(`/admins/${target.id}`, {
            method: 'PATCH',
            body: { status: dialog.type === 'disable' ? 'disabled' : 'active' },
          })
          notify(result.message)
          admins.reload()
        }}
      />

      <ConfirmDialog
        open={dialog?.type === 'reset'}
        title={`Reset ${target?.name}'s password?`}
        description="Their current password stops working and they are signed out. You get a temporary password to share with them."
        confirmLabel="Reset password"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const result = await adminRequest(`/admins/${target.id}/reset-password`, { method: 'POST' })
          setSecret({ ...result, title: `New password for ${target.email}` })
          admins.reload()
        }}
      />

      <ConfirmDialog
        open={dialog?.type === 'sessions'}
        title={`Sign ${target?.name} out everywhere?`}
        description="Every device they are signed in on is signed out. Their password still works."
        confirmLabel="Sign out"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          const result = await adminRequest(`/admins/${target.id}/sessions`, { method: 'DELETE' })
          notify(result.message)
          admins.reload()
        }}
      />

      <TemporaryPassword result={secret} onClose={() => setSecret(null)} />
    </div>
  )
}
