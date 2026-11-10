import { writeAudit } from './audit.js'
import { HttpError } from './util.js'

const DAY_MS = 24 * 60 * 60 * 1000
export const ACCOUNT_STATUSES = ['active', 'suspended', 'banned']

/* Validates a suspension end sent by the admin UI: 1 minute to 1 year ahead. */
export function suspensionEnd(value) {
  const until = new Date(value)
  const ahead = until.getTime() - Date.now()
  if (Number.isNaN(ahead) || ahead < 60 * 1000 || ahead > 365 * DAY_MS) {
    throw new HttpError(400, 'Choose when the suspension ends (up to one year from now).')
  }
  return until
}

/*
 * Suspends, bans or reactivates an account inside the caller's transaction.
 * Suspending or banning bumps session_version so every existing login stops
 * working; a ban also closes the user's live events. Call afterStatusChange
 * once committed.
 */
export async function setAccountStatus(db, deps, request, clientId, { status, reason, until = null, source = 'user' }) {
  const client = await lockClient(db, clientId)
  if (client.account_status === status && status !== 'suspended') {
    throw new HttpError(409, `This account is already ${status}.`)
  }
  await db.execute(
    `UPDATE clients
     SET account_status = ?, status_reason = ?,
         suspended_until = ${until ? 'FROM_UNIXTIME(?)' : 'NULL'},
         session_version = session_version + ?
     WHERE client_id = ?`,
    [
      status,
      status === 'active' ? null : reason,
      ...(until ? [Math.floor(until.getTime() / 1000)] : []),
      status === 'active' ? 0 : 1,
      clientId,
    ],
  )
  const closedEvents = status === 'banned' ? await closeHostedEvents(db, deps, clientId) : []
  await writeAudit(db, request, `user.${status === 'active' ? 'reactivated' : status}`, {
    targetType: 'user',
    targetId: clientId,
    details: {
      name: client.full_name,
      previousStatus: client.account_status,
      reason,
      until: until?.toISOString() ?? null,
      via: source,
      closedEvents: closedEvents.map((event) => event.publicId),
    },
  })
  return { clientId, status, closedEvents }
}

export function afterStatusChange(deps, { clientId, status, closedEvents }) {
  if (status !== 'active') deps.disconnectUser(clientId, status === 'banned' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED')
  afterEventsClosed(deps, closedEvents)
}

export async function warnUser(db, request, clientId, message, source = 'user') {
  const client = await lockClient(db, clientId)
  await db.execute('UPDATE clients SET warning_count = warning_count + 1 WHERE client_id = ?', [clientId])
  await insertNotification(db, clientId, {
    type: 'account_warning',
    title: 'A warning from the Spontii team',
    message: `${message} Repeated issues can lead to a suspension.`,
  })
  await writeAudit(db, request, 'user.warned', {
    targetType: 'user',
    targetId: clientId,
    details: { name: client.full_name, reason: message, warnings: Number(client.warning_count) + 1, via: source },
  })
}

/* Admin-originated notifications use the same table and rendering as the app's own. */
export async function insertNotification(db, clientId, { type, title, message, route = null, dedupeKey = null }) {
  await db.execute(
    `INSERT INTO notifications (client_id, type, title, message, route, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE title = VALUES(title), message = VALUES(message), route = VALUES(route),
       read_at = NULL, dismissed_at = NULL, created_at = NOW()`,
    [clientId, type, title.slice(0, 120), message.slice(0, 500), route, dedupeKey],
  )
}

export async function lockClient(db, clientId) {
  const [rows] = await db.execute(
    `SELECT client_id, full_name, email, phone_number, spontiii_id, account_status,
            spontii_points, spontii_verified, warning_count
     FROM clients WHERE client_id = ? FOR UPDATE`,
    [clientId],
  )
  if (!rows[0]) throw new HttpError(404, 'User not found.')
  return rows[0]
}

/*
 * Closes an active event on the Spontii team's behalf: completes it, tells
 * approved attendees and (unless the host is the reason) the host. Runs in the
 * caller's transaction; returns what `afterCommit` needs to close live chats.
 */
export async function closeEventAsAdmin(db, deps, event, { notifyHost = true, reason = '' } = {}) {
  await deps.completeActivity(db, event, 'admin')
  const [attendees] = await db.execute(
    `SELECT applicant_client_id FROM activity_join_requests
     WHERE activity_id = ? AND status = 'approved'`,
    [event.activity_id],
  )
  for (const attendee of attendees) {
    await insertNotification(db, attendee.applicant_client_id, {
      type: 'event_cancelled',
      title: 'Event cancelled',
      message: `${event.title} was cancelled by the Spontii team.`,
      dedupeKey: `event-cancelled:${event.public_id}`,
    })
  }
  if (notifyHost) {
    await insertNotification(db, event.host_client_id, {
      type: 'event_cancelled',
      title: 'Your event was closed',
      message: `The Spontii team closed ${event.title}.${reason ? ` Reason: ${reason}` : ''}`,
      dedupeKey: `event-cancelled:${event.public_id}`,
    })
  }
  return {
    activityId: event.activity_id,
    publicId: event.public_id,
    hostId: Number(event.host_client_id),
    attendeeIds: attendees.map((row) => Number(row.applicant_client_id)),
  }
}

export async function closeHostedEvents(db, deps, clientId) {
  const [events] = await db.execute(
    `SELECT activity_id, public_id, host_client_id, title FROM activities
     WHERE host_client_id = ? AND status = 'active' FOR UPDATE`,
    [clientId],
  )
  const closed = []
  for (const event of events) {
    closed.push(await closeEventAsAdmin(db, deps, event, { notifyHost: false }))
  }
  return closed
}

/* After the commit: close live chats and host DMs for the closed events. */
export function afterEventsClosed(deps, closed) {
  for (const event of closed) {
    deps.notifyInBackground(
      deps.notifyEventClosed(deps.pool, event.activityId, event.publicId, event.hostId),
      'close chats for an event closed by an admin',
    )
  }
}
