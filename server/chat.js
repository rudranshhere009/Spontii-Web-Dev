import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { Server } from 'socket.io'

/*
 * Messaging rules:
 * - Event live chat: the host and approved attendees, while the event is active.
 * - Direct messages: accepted friends, or a host and an approved attendee of
 *   the same active event. Attendees who aren't friends use the live chat.
 * - A block in either direction stops all direct messages.
 * Rights are checked on every send because friendships, approvals and blocks change.
 */

const MESSAGE_MAX_LENGTH = 2000
const PAGE_SIZE = 50
const AFTER_PAGE_SIZE = 100
const EVENT_CHAT_RETENTION_HOURS = 24
const DIRECT_MESSAGE_RETENTION_DAYS = 90
const REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'safety', 'other']
const NO_MESSAGING = "You can't message this person right now."

let io = null

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (request) => String(request.clientId),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'You’re sending messages too quickly. Please wait a moment.' },
})

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (request) => String(request.clientId),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many reports. Please try again later.' },
})

const blockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (request) => String(request.clientId),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many changes. Please try again later.' },
})

/* -------------------------------------------------------------------------- */
/* Schema                                                                     */
/* -------------------------------------------------------------------------- */

export async function createChatTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_client_id BIGINT UNSIGNED NOT NULL,
      blocked_client_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (blocker_client_id, blocked_client_id),
      KEY idx_user_blocks_blocked (blocked_client_id),
      CONSTRAINT fk_user_block_blocker FOREIGN KEY (blocker_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE,
      CONSTRAINT fk_user_block_blocked FOREIGN KEY (blocked_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  /* No activity foreign key: events are deleted when they end, DM history is not. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_conversations (
      conversation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      client_low_id BIGINT UNSIGNED NOT NULL,
      client_high_id BIGINT UNSIGNED NOT NULL,
      low_last_read_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      high_last_read_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      last_message_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (conversation_id),
      UNIQUE KEY uq_direct_conversation_pair (client_low_id, client_high_id),
      KEY idx_direct_conversation_high (client_high_id, last_message_at),
      CONSTRAINT fk_direct_conversation_low FOREIGN KEY (client_low_id)
        REFERENCES clients (client_id) ON DELETE CASCADE,
      CONSTRAINT fk_direct_conversation_high FOREIGN KEY (client_high_id)
        REFERENCES clients (client_id) ON DELETE CASCADE,
      CONSTRAINT chk_direct_conversation_distinct CHECK (client_low_id < client_high_id)
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      conversation_id BIGINT UNSIGNED NOT NULL,
      sender_client_id BIGINT UNSIGNED NOT NULL,
      message_text VARCHAR(2000) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id),
      KEY idx_direct_messages_conversation (conversation_id, message_id),
      KEY idx_direct_messages_retention (created_at),
      CONSTRAINT fk_direct_message_conversation FOREIGN KEY (conversation_id)
        REFERENCES direct_conversations (conversation_id) ON DELETE CASCADE,
      CONSTRAINT fk_direct_message_sender FOREIGN KEY (sender_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_chat_reads (
      activity_id BIGINT UNSIGNED NOT NULL,
      client_id BIGINT UNSIGNED NOT NULL,
      last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (activity_id, client_id),
      CONSTRAINT fk_activity_chat_read_activity FOREIGN KEY (activity_id)
        REFERENCES activities (activity_id) ON DELETE CASCADE,
      CONSTRAINT fk_activity_chat_read_client FOREIGN KEY (client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  /* The snapshot outlives the message, which may be deleted by retention. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_reports (
      report_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      reporter_client_id BIGINT UNSIGNED NOT NULL,
      reported_client_id BIGINT UNSIGNED NOT NULL,
      source ENUM('event', 'direct') NOT NULL,
      message_id BIGINT UNSIGNED NOT NULL,
      message_snapshot VARCHAR(2000) NOT NULL,
      reason VARCHAR(40) NOT NULL,
      status ENUM('open', 'reviewed', 'actioned') NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (report_id),
      UNIQUE KEY uq_message_report_once (reporter_client_id, source, message_id),
      KEY idx_message_reports_status (status, created_at),
      CONSTRAINT fk_message_report_reporter FOREIGN KEY (reporter_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
}

/*
 * TIMESTAMP columns are compared with NOW() (both in the session time zone),
 * so retention is exact whatever time zone the database runs in.
 */
export async function cleanupExpiredMessages(pool) {
  await pool.execute(
    `DELETE FROM activity_chat_messages
     WHERE created_at < NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR`,
  )
  await pool.execute(
    `DELETE FROM direct_messages
     WHERE created_at < NOW() - INTERVAL ${DIRECT_MESSAGE_RETENTION_DAYS} DAY
     LIMIT 5000`,
  )
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/* Trims, strips control and text-direction characters, and enforces the length limit. */
export function cleanMessageText(value) {
  if (typeof value !== 'string') return null
  const text = value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\P{Cc}\n\t]/gu, '')
    .replace(/[‪-‮⁦-⁩]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text && text.length <= MESSAGE_MAX_LENGTH ? text : null
}

function isId(value) {
  return typeof value === 'string' && /^\d{1,19}$/.test(value)
}

function personIdParam(request) {
  const { personId } = request.params
  if (!/^\d{1,19}$/.test(personId)) return null
  const id = Number(personId)
  return Number.isSafeInteger(id) && id > 0 && id !== request.clientId ? id : null
}

function requireJson(request, response, next) {
  if (request.is('application/json')) return next()
  return response.status(415).json({ message: 'Send this request as JSON.' })
}

function messageCursor(query) {
  if (query.after !== undefined) return isId(query.after) ? { after: query.after } : null
  if (query.before !== undefined) return isId(query.before) ? { before: query.before } : null
  return {}
}

function cursorQuery(cursor) {
  if (cursor.after) {
    return { where: 'AND m.message_id > ?', params: [cursor.after], order: 'ASC', limit: AFTER_PAGE_SIZE }
  }
  if (cursor.before) {
    return { where: 'AND m.message_id < ?', params: [cursor.before], order: 'DESC', limit: PAGE_SIZE }
  }
  return { where: '', params: [], order: 'DESC', limit: PAGE_SIZE }
}

/* Rows are fetched with limit + 1 so `hasMore` needs no second query. */
function messagePage(rows, cursor, limit) {
  const page = rows.slice(0, limit)
  return {
    messages: (cursor.after ? page : page.reverse()).map(chatMessage),
    hasMore: rows.length > limit,
  }
}

function chatSender(row) {
  return {
    id: Number(row.client_id),
    name: row.full_name,
    avatar: row.profile_photo_mime ? `/api/people/${row.client_id}/photo` : null,
  }
}

function chatMessage(row) {
  return {
    id: String(row.message_id),
    text: row.message_text,
    createdAt: new Date(Number(row.created_unix) * 1000).toISOString(),
    sender: chatSender(row),
  }
}

const MESSAGE_COLUMNS = `m.message_id, m.message_text, UNIX_TIMESTAMP(m.created_at) AS created_unix,
  c.client_id, c.full_name, c.profile_photo_mime`

async function loadMessage(db, table, messageId) {
  const [rows] = await db.execute(
    `SELECT ${MESSAGE_COLUMNS}
     FROM ${table} m JOIN clients c ON c.client_id = m.sender_client_id
     WHERE m.message_id = ? LIMIT 1`,
    [messageId],
  )
  return chatMessage(rows[0])
}

function lastMessage(row) {
  if (!row.last_message_id) return null
  return {
    id: String(row.last_message_id),
    text: row.last_text,
    createdAt: new Date(Number(row.last_unix) * 1000).toISOString(),
    senderId: Number(row.last_sender_id),
    senderName: row.last_sender_name || null,
  }
}

/* -------------------------------------------------------------------------- */
/* Rights                                                                     */
/* -------------------------------------------------------------------------- */

export async function blockStatus(db, meId, otherId) {
  const [rows] = await db.execute(
    `SELECT blocker_client_id FROM user_blocks
     WHERE (blocker_client_id = ? AND blocked_client_id = ?)
        OR (blocker_client_id = ? AND blocked_client_id = ?)`,
    [meId, otherId, otherId, meId],
  )
  return {
    byMe: rows.some((row) => Number(row.blocker_client_id) === meId),
    byThem: rows.some((row) => Number(row.blocker_client_id) === otherId),
  }
}

export async function isBlockedBetween(db, firstId, secondId) {
  const blocks = await blockStatus(db, firstId, secondId)
  return blocks.byMe || blocks.byThem
}

/*
 * Whether senderId may send a direct message to recipientId right now.
 * `reason` is for the sender's own UI: 'blocked' (they blocked the other
 * person), 'unavailable' (the other person blocked them, deliberately vague)
 * or 'not_connected' (not friends and no shared active event).
 */
export async function messagingRights(db, senderId, recipientId) {
  if (senderId === recipientId) return { allowed: false, reason: 'not_connected' }
  const blocks = await blockStatus(db, senderId, recipientId)
  if (blocks.byMe) return { allowed: false, reason: 'blocked' }
  if (blocks.byThem) return { allowed: false, reason: 'unavailable' }

  const [friends] = await db.execute(
    `SELECT 1 FROM friendships
     WHERE client_low_id = LEAST(?, ?) AND client_high_id = GREATEST(?, ?)
       AND status = 'accepted' LIMIT 1`,
    [senderId, recipientId, senderId, recipientId],
  )
  if (friends[0]) return { allowed: true, via: 'friends' }

  /* One side must be the host, so two attendees never match. */
  const [events] = await db.execute(
    `SELECT a.public_id FROM activities a
     JOIN activity_join_requests jr
       ON jr.activity_id = a.activity_id AND jr.status = 'approved'
     WHERE a.status = 'active' AND a.ends_at > UTC_TIMESTAMP()
       AND ((a.host_client_id = ? AND jr.applicant_client_id = ?)
         OR (a.host_client_id = ? AND jr.applicant_client_id = ?))
     LIMIT 1`,
    [senderId, recipientId, recipientId, senderId],
  )
  if (events[0]) return { allowed: true, via: 'event', activityId: events[0].public_id }

  return { allowed: false, reason: 'not_connected' }
}

async function eventChatAccess(db, activityPublicId, clientId) {
  const [rows] = await db.execute(
    `SELECT a.activity_id, a.public_id, a.host_client_id, a.title,
       EXISTS(SELECT 1 FROM activity_join_requests jr
              WHERE jr.activity_id = a.activity_id
                AND jr.applicant_client_id = ? AND jr.status = 'approved') AS is_attendee
     FROM activities a
     WHERE a.public_id = ? AND a.status = 'active' AND a.ends_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [clientId, activityPublicId],
  )
  const activity = rows[0]
  if (!activity) return { activity: null, allowed: false }
  return {
    activity,
    allowed: Number(activity.host_client_id) === clientId || Boolean(activity.is_attendee),
  }
}

/* Current members, minus anyone who has blocked the sender. */
async function eventChatRecipients(db, activityId, senderId) {
  const [rows] = await db.execute(
    `SELECT members.client_id FROM (
       SELECT host_client_id AS client_id FROM activities WHERE activity_id = ?
       UNION
       SELECT applicant_client_id FROM activity_join_requests
       WHERE activity_id = ? AND status = 'approved'
     ) members
     WHERE NOT EXISTS (
       SELECT 1 FROM user_blocks b
       WHERE b.blocker_client_id = members.client_id AND b.blocked_client_id = ?
     )`,
    [activityId, activityId, senderId],
  )
  return rows.map((row) => Number(row.client_id))
}

async function relationshipBetween(db, meId, otherId) {
  const [rows] = await db.execute(
    `SELECT friendship_id, requester_client_id, status FROM friendships
     WHERE client_low_id = LEAST(?, ?) AND client_high_id = GREATEST(?, ?)
     LIMIT 1`,
    [meId, otherId, meId, otherId],
  )
  const relation = rows[0]
  return {
    relationship: relation?.status === 'accepted'
      ? 'friends'
      : relation?.status === 'pending'
        ? Number(relation.requester_client_id) === meId ? 'outgoing' : 'incoming'
        : 'none',
    requestId: relation?.status === 'pending' ? String(relation.friendship_id) : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Socket.IO                                                                  */
/* -------------------------------------------------------------------------- */

function userRoom(clientId) {
  return `user:${clientId}`
}

export function emitToUsers(clientIds, event, payload) {
  const ids = [...new Set(clientIds)]
  if (!io || !ids.length) return
  io.to(ids.map(userRoom)).emit(event, payload)
}

/* Pushes after a commit are best effort; the change itself already succeeded. */
export function notifyInBackground(promise, description) {
  promise.catch((error) => console.error(`Failed to ${description}:`, error))
}

/* Tells both people whether their direct thread is open after a change. */
export async function notifyDirectAccess(db, firstId, secondId) {
  if (!io) return
  const [forFirst, forSecond] = await Promise.all([
    messagingRights(db, firstId, secondId),
    messagingRights(db, secondId, firstId),
  ])
  emitToUsers([firstId], 'thread:access', {
    kind: 'direct',
    threadId: String(secondId),
    canSend: forFirst.allowed,
    reason: forFirst.reason ?? null,
  })
  emitToUsers([secondId], 'thread:access', {
    kind: 'direct',
    threadId: String(firstId),
    canSend: forSecond.allowed,
    reason: forSecond.reason ?? null,
  })
}

/* Closes an event's live chat and its host ↔ attendee DMs for everyone in it. */
export async function notifyEventClosed(db, activityId, activityPublicId, hostId) {
  if (!io) return
  const [rows] = await db.execute(
    `SELECT applicant_client_id FROM activity_join_requests
     WHERE activity_id = ? AND status = 'approved'`,
    [activityId],
  )
  const attendeeIds = rows.map((row) => Number(row.applicant_client_id))
  emitToUsers([hostId, ...attendeeIds], 'thread:access', {
    kind: 'event',
    threadId: activityPublicId,
    canSend: false,
    reason: 'ended',
  })
  await Promise.all(attendeeIds.map((attendeeId) => notifyDirectAccess(db, hostId, attendeeId)))
}

/*
 * Receive-only: clients never send events, so there are no handlers to
 * authorize. Every push goes to personal rooms chosen by the API per message.
 */
export function attachChatSocket(httpServer, { cookieName, frontendOrigins, isAllowedOrigin, verifySessionToken }) {
  io = new Server(httpServer, {
    serveClient: false,
    ...(frontendOrigins.length && { cors: { origin: frontendOrigins, credentials: true } }),
    /*
     * CORS does not apply to WebSocket upgrades, so the Origin is checked
     * here. Browsers always send it on cross-site requests; a missing Origin
     * means a non-browser client, which can't ride on a victim's cookie.
     */
    allowRequest: (request, callback) => {
      const origin = request.headers.origin
      callback(null, !origin || isAllowedOrigin(origin))
    },
  })
  io.engine.use(cookieParser())
  io.use((socket, next) => {
    const session = verifySessionToken(socket.request.cookies?.[cookieName])
    if (!session) return next(new Error('unauthorized'))
    socket.data.clientId = session.clientId
    socket.data.expiresAt = session.expiresAt
    return next()
  })
  io.on('connection', (socket) => {
    socket.join(userRoom(socket.data.clientId))
    const remaining = Math.min(Math.max(socket.data.expiresAt - Date.now(), 0), 2 ** 31 - 1)
    const expiryTimer = setTimeout(() => socket.disconnect(true), remaining)
    socket.on('disconnect', () => clearTimeout(expiryTimer))
  })
  return io
}

/* -------------------------------------------------------------------------- */
/* Inbox                                                                      */
/* -------------------------------------------------------------------------- */

async function loadInbox(pool, meId) {
  const [eventRows] = await pool.execute(
    `SELECT a.public_id, a.title, a.banner_image, a.ends_at, a.host_client_id,
            lm.message_id AS last_message_id, lm.message_text AS last_text,
            UNIX_TIMESTAMP(lm.created_at) AS last_unix,
            lm.sender_client_id AS last_sender_id, lc.full_name AS last_sender_name,
            (SELECT COUNT(*) FROM activity_chat_messages um
             WHERE um.activity_id = a.activity_id AND um.sender_client_id <> ?
               AND um.message_id > COALESCE(r.last_read_message_id, 0)
               AND um.created_at >= NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR
               AND NOT EXISTS (SELECT 1 FROM user_blocks b
                               WHERE b.blocker_client_id = ? AND b.blocked_client_id = um.sender_client_id)
            ) AS unread_count
     FROM activities a
     LEFT JOIN activity_chat_reads r ON r.activity_id = a.activity_id AND r.client_id = ?
     LEFT JOIN activity_chat_messages lm ON lm.message_id = (
       SELECT MAX(m2.message_id) FROM activity_chat_messages m2
       WHERE m2.activity_id = a.activity_id
         AND m2.created_at >= NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR
         AND NOT EXISTS (SELECT 1 FROM user_blocks b
                         WHERE b.blocker_client_id = ? AND b.blocked_client_id = m2.sender_client_id)
     )
     LEFT JOIN clients lc ON lc.client_id = lm.sender_client_id
     WHERE a.status = 'active' AND a.ends_at > UTC_TIMESTAMP()
       AND (a.host_client_id = ? OR EXISTS (
         SELECT 1 FROM activity_join_requests jr
         WHERE jr.activity_id = a.activity_id
           AND jr.applicant_client_id = ? AND jr.status = 'approved'))
     ORDER BY COALESCE(lm.message_id, 0) DESC, a.starts_at ASC`,
    [meId, meId, meId, meId, meId, meId],
  )

  const [directRows] = await pool.execute(
    `SELECT other.client_id, other.full_name, other.profile_photo_mime,
            lm.message_id AS last_message_id, lm.message_text AS last_text,
            UNIX_TIMESTAMP(lm.created_at) AS last_unix, lm.sender_client_id AS last_sender_id,
            (SELECT COUNT(*) FROM direct_messages um
             WHERE um.conversation_id = dc.conversation_id AND um.sender_client_id <> ?
               AND um.message_id > IF(dc.client_low_id = ?, dc.low_last_read_id, dc.high_last_read_id)
            ) AS unread_count,
            EXISTS(SELECT 1 FROM user_blocks b
                   WHERE b.blocker_client_id = ? AND b.blocked_client_id = other.client_id) AS blocked_by_me,
            EXISTS(SELECT 1 FROM user_blocks b
                   WHERE b.blocker_client_id = other.client_id AND b.blocked_client_id = ?) AS blocked_by_them,
            EXISTS(SELECT 1 FROM friendships f
                   WHERE f.client_low_id = dc.client_low_id AND f.client_high_id = dc.client_high_id
                     AND f.status = 'accepted') AS is_friend,
            EXISTS(SELECT 1 FROM activities ea
                   JOIN activity_join_requests ejr
                     ON ejr.activity_id = ea.activity_id AND ejr.status = 'approved'
                   WHERE ea.status = 'active' AND ea.ends_at > UTC_TIMESTAMP()
                     AND ((ea.host_client_id = ? AND ejr.applicant_client_id = other.client_id)
                       OR (ea.host_client_id = other.client_id AND ejr.applicant_client_id = ?))
            ) AS shares_event
     FROM direct_conversations dc
     JOIN clients other
       ON other.client_id = IF(dc.client_low_id = ?, dc.client_high_id, dc.client_low_id)
     JOIN direct_messages lm ON lm.message_id = (
       SELECT MAX(m2.message_id) FROM direct_messages m2 WHERE m2.conversation_id = dc.conversation_id
     )
     WHERE dc.client_low_id = ? OR dc.client_high_id = ?
     ORDER BY lm.message_id DESC
     LIMIT 100`,
    [meId, meId, meId, meId, meId, meId, meId, meId, meId],
  )

  const eventChats = eventRows.map((row) => ({
    activityId: row.public_id,
    title: row.title,
    image: row.banner_image,
    endsAt: new Date(row.ends_at).toISOString(),
    isHost: Number(row.host_client_id) === meId,
    lastMessage: lastMessage(row),
    unreadCount: Number(row.unread_count || 0),
  }))
  const directMessages = directRows.map((row) => {
    const reason = row.blocked_by_me
      ? 'blocked'
      : row.blocked_by_them
        ? 'unavailable'
        : row.is_friend || row.shares_event ? null : 'not_connected'
    return {
      person: chatSender(row),
      lastMessage: lastMessage(row),
      unreadCount: Number(row.unread_count || 0),
      canSend: reason === null,
      reason,
    }
  })
  const unreadTotal = [...eventChats, ...directMessages]
    .reduce((total, thread) => total + thread.unreadCount, 0)
  return { eventChats, directMessages, unreadTotal }
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

export function registerChatRoutes(app, { pool, requireSession }) {
  /* ---------------------------- Event live chat --------------------------- */

  app.get('/api/activities/:id/chat', requireSession, async (request, response, next) => {
    const cursor = messageCursor(request.query)
    if (!cursor) return response.status(400).json({ message: 'Invalid message cursor.' })
    try {
      const access = await eventChatAccess(pool, request.params.id, request.clientId)
      if (!access.activity) return response.status(404).json({ message: 'Event is no longer active.' })
      if (!access.allowed) return response.status(403).json({ message: 'Live chat is available only to the host and approved attendees.' })
      const page = cursorQuery(cursor)
      const [rows] = await pool.execute(
        `SELECT ${MESSAGE_COLUMNS}
         FROM activity_chat_messages m
         JOIN clients c ON c.client_id = m.sender_client_id
         WHERE m.activity_id = ?
           AND m.created_at >= NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR
           ${page.where}
           AND NOT EXISTS (SELECT 1 FROM user_blocks b
                           WHERE b.blocker_client_id = ? AND b.blocked_client_id = m.sender_client_id)
         ORDER BY m.message_id ${page.order}
         LIMIT ${page.limit + 1}`,
        [access.activity.activity_id, ...page.params, request.clientId],
      )
      response.set('Cache-Control', 'private, no-store')
      response.json({
        ...messagePage(rows, cursor, page.limit),
        title: access.activity.title,
        canSend: true,
        reason: null,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/activities/:id/chat', requireSession, requireJson, messageLimiter, async (request, response, next) => {
    const text = cleanMessageText(request.body?.text)
    if (!text) return response.status(400).json({ message: `Message must be between 1 and ${MESSAGE_MAX_LENGTH} characters.` })
    try {
      const access = await eventChatAccess(pool, request.params.id, request.clientId)
      if (!access.activity) return response.status(404).json({ message: 'Event is no longer active.' })
      if (!access.allowed) return response.status(403).json({ message: 'Live chat is available only to the host and approved attendees.' })
      const [result] = await pool.execute(
        `INSERT INTO activity_chat_messages (activity_id, sender_client_id, message_text)
         VALUES (?, ?, ?)`,
        [access.activity.activity_id, request.clientId, text],
      )
      await pool.execute(
        `INSERT INTO activity_chat_reads (activity_id, client_id, last_read_message_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id))`,
        [access.activity.activity_id, request.clientId, result.insertId],
      )
      const message = await loadMessage(pool, 'activity_chat_messages', result.insertId)
      const recipients = await eventChatRecipients(pool, access.activity.activity_id, request.clientId)
      emitToUsers(recipients, 'message:new', {
        kind: 'event',
        threadId: access.activity.public_id,
        message,
      })
      response.status(201).json({ message })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/activities/:id/chat/read', requireSession, requireJson, async (request, response, next) => {
    const lastReadId = request.body?.lastReadId
    if (!isId(lastReadId)) return response.status(400).json({ message: 'Invalid message.' })
    try {
      const access = await eventChatAccess(pool, request.params.id, request.clientId)
      if (!access.activity || !access.allowed) return response.status(404).json({ message: 'Chat not found.' })
      /* Capped at the newest message so a client can't mark future messages as read. */
      await pool.execute(
        `INSERT INTO activity_chat_reads (activity_id, client_id, last_read_message_id)
         SELECT ?, ?, LEAST(?, COALESCE(MAX(message_id), 0))
         FROM activity_chat_messages WHERE activity_id = ?
         ON DUPLICATE KEY UPDATE
           last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id))`,
        [access.activity.activity_id, request.clientId, lastReadId, access.activity.activity_id],
      )
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  /* The host takes an approved attendee out: no live chat, no host DM, no rejoining. */
  app.delete('/api/activities/:id/attendees/:clientId', requireSession, async (request, response, next) => {
    if (!/^\d{1,19}$/.test(request.params.clientId)) {
      return response.status(400).json({ message: 'Invalid attendee.' })
    }
    const attendeeId = Number(request.params.clientId)
    let connection
    try {
      connection = await pool.getConnection()
      await connection.beginTransaction()
      const [activities] = await connection.execute(
        `SELECT activity_id, public_id, host_client_id, title FROM activities
         WHERE public_id = ? AND status = 'active' AND ends_at > UTC_TIMESTAMP()
         FOR UPDATE`,
        [request.params.id],
      )
      const activity = activities[0]
      if (!activity || Number(activity.host_client_id) !== request.clientId) {
        await connection.rollback()
        return response.status(404).json({ message: 'Hosted event not found.' })
      }
      const [result] = await connection.execute(
        `UPDATE activity_join_requests SET status = 'removed', reviewed_at = NOW()
         WHERE activity_id = ? AND applicant_client_id = ? AND status = 'approved'`,
        [activity.activity_id, attendeeId],
      )
      if (result.affectedRows !== 1) {
        await connection.rollback()
        return response.status(404).json({ message: 'Attendee not found.' })
      }
      await connection.execute(
        `INSERT INTO notifications
           (client_id, type, title, message, route, dedupe_key)
         VALUES (?, 'event_join_review', 'Event update', ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title), message = VALUES(message),
           read_at = NULL, dismissed_at = NULL, created_at = NOW()`,
        [
          attendeeId,
          `The host removed you from ${activity.title}.`,
          `/activities/${activity.public_id}`,
          `event-join-review:${activity.public_id}:${attendeeId}`,
        ],
      )
      await connection.commit()
      emitToUsers([attendeeId], 'thread:access', {
        kind: 'event',
        threadId: activity.public_id,
        canSend: false,
        reason: 'removed',
      })
      notifyInBackground(
        notifyDirectAccess(pool, request.clientId, attendeeId),
        'update direct message access after removing an attendee',
      )
      response.json({ status: 'removed' })
    } catch (error) {
      if (connection) await connection.rollback()
      next(error)
    } finally {
      connection?.release()
    }
  })

  /* ---------------------------- Direct messages --------------------------- */

  app.get('/api/dm/:personId/messages', requireSession, async (request, response, next) => {
    const personId = personIdParam(request)
    if (!personId) return response.status(400).json({ message: 'Invalid person.' })
    const cursor = messageCursor(request.query)
    if (!cursor) return response.status(400).json({ message: 'Invalid message cursor.' })
    try {
      const [people] = await pool.execute(
        'SELECT client_id, full_name, profile_photo_mime FROM clients WHERE client_id = ? LIMIT 1',
        [personId],
      )
      if (!people[0]) return response.status(404).json({ message: 'Conversation not found.' })
      const [conversations] = await pool.execute(
        `SELECT conversation_id FROM direct_conversations
         WHERE client_low_id = LEAST(?, ?) AND client_high_id = GREATEST(?, ?) LIMIT 1`,
        [request.clientId, personId, request.clientId, personId],
      )
      const conversation = conversations[0]
      const rights = await messagingRights(pool, request.clientId, personId)
      /* No history and no right to start one: don't confirm the person exists. */
      if (!conversation && !rights.allowed) {
        return response.status(404).json({ message: 'Conversation not found.' })
      }
      let page = { messages: [], hasMore: false }
      if (conversation) {
        const query = cursorQuery(cursor)
        const [rows] = await pool.execute(
          `SELECT ${MESSAGE_COLUMNS}
           FROM direct_messages m
           JOIN clients c ON c.client_id = m.sender_client_id
           WHERE m.conversation_id = ? ${query.where}
           ORDER BY m.message_id ${query.order}
           LIMIT ${query.limit + 1}`,
          [conversation.conversation_id, ...query.params],
        )
        page = messagePage(rows, cursor, query.limit)
      }
      response.set('Cache-Control', 'private, no-store')
      response.json({
        ...page,
        person: chatSender(people[0]),
        ...(await relationshipBetween(pool, request.clientId, personId)),
        canSend: rights.allowed,
        reason: rights.reason ?? null,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/dm/:personId/messages', requireSession, requireJson, messageLimiter, async (request, response, next) => {
    const personId = personIdParam(request)
    if (!personId) return response.status(400).json({ message: 'Invalid person.' })
    const text = cleanMessageText(request.body?.text)
    if (!text) return response.status(400).json({ message: `Message must be between 1 and ${MESSAGE_MAX_LENGTH} characters.` })
    let connection
    try {
      connection = await pool.getConnection()
      await connection.beginTransaction()
      const rights = await messagingRights(connection, request.clientId, personId)
      if (!rights.allowed) {
        await connection.rollback()
        return response.status(403).json({ message: NO_MESSAGING, reason: rights.reason })
      }
      /* LAST_INSERT_ID(conversation_id) makes insertId the existing row's id on a duplicate. */
      const [conversation] = await connection.execute(
        `INSERT INTO direct_conversations (client_low_id, client_high_id, last_message_at)
         VALUES (LEAST(?, ?), GREATEST(?, ?), NOW())
         ON DUPLICATE KEY UPDATE
           conversation_id = LAST_INSERT_ID(conversation_id), last_message_at = NOW()`,
        [request.clientId, personId, request.clientId, personId],
      )
      const [inserted] = await connection.execute(
        `INSERT INTO direct_messages (conversation_id, sender_client_id, message_text)
         VALUES (?, ?, ?)`,
        [conversation.insertId, request.clientId, text],
      )
      const readColumn = request.clientId < personId ? 'low_last_read_id' : 'high_last_read_id'
      await connection.execute(
        `UPDATE direct_conversations SET ${readColumn} = ? WHERE conversation_id = ?`,
        [inserted.insertId, conversation.insertId],
      )
      await connection.commit()
      const message = await loadMessage(pool, 'direct_messages', inserted.insertId)
      emitToUsers([personId], 'message:new', { kind: 'direct', threadId: String(request.clientId), message })
      emitToUsers([request.clientId], 'message:new', { kind: 'direct', threadId: String(personId), message })
      response.status(201).json({ message })
    } catch (error) {
      if (connection) await connection.rollback()
      next(error)
    } finally {
      connection?.release()
    }
  })

  app.post('/api/dm/:personId/read', requireSession, requireJson, async (request, response, next) => {
    const personId = personIdParam(request)
    const lastReadId = request.body?.lastReadId
    if (!personId || !isId(lastReadId)) return response.status(400).json({ message: 'Invalid message.' })
    const readColumn = request.clientId < personId ? 'low_last_read_id' : 'high_last_read_id'
    try {
      await pool.execute(
        `UPDATE direct_conversations dc
         SET dc.${readColumn} = GREATEST(dc.${readColumn}, LEAST(?, COALESCE(
           (SELECT MAX(m.message_id) FROM direct_messages m WHERE m.conversation_id = dc.conversation_id), 0)))
         WHERE dc.client_low_id = LEAST(?, ?) AND dc.client_high_id = GREATEST(?, ?)`,
        [lastReadId, request.clientId, personId, request.clientId, personId],
      )
      response.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  /* --------------------------------- Inbox -------------------------------- */

  app.get('/api/inbox', requireSession, async (request, response, next) => {
    try {
      response.set('Cache-Control', 'private, no-store')
      response.json(await loadInbox(pool, request.clientId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/inbox/unread-count', requireSession, async (request, response, next) => {
    try {
      const { unreadTotal } = await loadInbox(pool, request.clientId)
      response.set('Cache-Control', 'private, no-store')
      response.json({ total: unreadTotal })
    } catch (error) {
      next(error)
    }
  })

  /* -------------------------------- Blocks -------------------------------- */

  app.get('/api/blocks', requireSession, async (request, response, next) => {
    try {
      const [rows] = await pool.execute(
        `SELECT c.client_id, c.full_name, c.profile_photo_mime
         FROM user_blocks b JOIN clients c ON c.client_id = b.blocked_client_id
         WHERE b.blocker_client_id = ?
         ORDER BY b.created_at DESC`,
        [request.clientId],
      )
      response.json({ blocked: rows.map(chatSender) })
    } catch (error) {
      next(error)
    }
  })

  /* Blocking also ends any friendship or pending request between the two. */
  app.post('/api/blocks/:personId', requireSession, blockLimiter, async (request, response, next) => {
    const personId = personIdParam(request)
    if (!personId) return response.status(400).json({ message: 'Invalid person.' })
    let connection
    try {
      connection = await pool.getConnection()
      await connection.beginTransaction()
      const [people] = await connection.execute(
        'SELECT client_id FROM clients WHERE client_id = ? LIMIT 1',
        [personId],
      )
      if (!people[0]) {
        await connection.rollback()
        return response.status(404).json({ message: 'Person not found.' })
      }
      await connection.execute(
        'INSERT IGNORE INTO user_blocks (blocker_client_id, blocked_client_id) VALUES (?, ?)',
        [request.clientId, personId],
      )
      const [friendships] = await connection.execute(
        `SELECT friendship_id FROM friendships
         WHERE client_low_id = LEAST(?, ?) AND client_high_id = GREATEST(?, ?) FOR UPDATE`,
        [request.clientId, personId, request.clientId, personId],
      )
      if (friendships[0]) {
        await connection.execute(
          'DELETE FROM friendships WHERE friendship_id = ?',
          [friendships[0].friendship_id],
        )
        await connection.execute(
          `UPDATE notifications SET dismissed_at = COALESCE(dismissed_at, NOW())
           WHERE client_id IN (?, ?) AND dedupe_key IN (?, ?)`,
          [
            request.clientId,
            personId,
            `friend-request:${friendships[0].friendship_id}`,
            `friend-accepted:${friendships[0].friendship_id}`,
          ],
        )
      }
      await connection.commit()
      notifyInBackground(
        notifyDirectAccess(pool, request.clientId, personId),
        'update direct message access after a block',
      )
      emitToUsers([request.clientId, personId], 'friends:changed', {})
      response.status(201).json({ status: 'blocked' })
    } catch (error) {
      if (connection) await connection.rollback()
      next(error)
    } finally {
      connection?.release()
    }
  })

  app.delete('/api/blocks/:personId', requireSession, blockLimiter, async (request, response, next) => {
    const personId = personIdParam(request)
    if (!personId) return response.status(400).json({ message: 'Invalid person.' })
    try {
      await pool.execute(
        'DELETE FROM user_blocks WHERE blocker_client_id = ? AND blocked_client_id = ?',
        [request.clientId, personId],
      )
      notifyInBackground(
        notifyDirectAccess(pool, request.clientId, personId),
        'update direct message access after an unblock',
      )
      response.json({ status: 'unblocked' })
    } catch (error) {
      next(error)
    }
  })

  /* -------------------------------- Reports ------------------------------- */

  /* You can only report a message you are allowed to see; its text is kept as a snapshot. */
  app.post('/api/reports', requireSession, requireJson, reportLimiter, async (request, response, next) => {
    const { source, messageId, reason } = request.body || {}
    if (!['event', 'direct'].includes(source) || !isId(messageId) || !REPORT_REASONS.includes(reason)) {
      return response.status(400).json({ message: 'Choose a message and a reason to report.' })
    }
    try {
      let message
      if (source === 'event') {
        const [rows] = await pool.execute(
          `SELECT m.message_text, m.sender_client_id, a.public_id
           FROM activity_chat_messages m JOIN activities a ON a.activity_id = m.activity_id
           WHERE m.message_id = ? LIMIT 1`,
          [messageId],
        )
        const access = rows[0] && await eventChatAccess(pool, rows[0].public_id, request.clientId)
        message = access?.allowed ? rows[0] : null
      } else {
        const [rows] = await pool.execute(
          `SELECT m.message_text, m.sender_client_id
           FROM direct_messages m
           JOIN direct_conversations dc ON dc.conversation_id = m.conversation_id
           WHERE m.message_id = ? AND (dc.client_low_id = ? OR dc.client_high_id = ?)
           LIMIT 1`,
          [messageId, request.clientId, request.clientId],
        )
        message = rows[0]
      }
      if (!message) return response.status(404).json({ message: 'Message not found.' })
      if (Number(message.sender_client_id) === request.clientId) {
        return response.status(400).json({ message: "You can't report your own message." })
      }
      await pool.execute(
        `INSERT IGNORE INTO message_reports
           (reporter_client_id, reported_client_id, source, message_id, message_snapshot, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [request.clientId, message.sender_client_id, source, messageId, message.message_text, reason],
      )
      response.status(201).json({ status: 'reported' })
    } catch (error) {
      next(error)
    }
  })
}
