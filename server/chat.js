import cookieParser from 'cookie-parser'
import { extname } from 'node:path'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { Server } from 'socket.io'
import { getSetting } from './admin/settings.js'
import { countDaily } from './metrics.js'

/*
 * Messaging rules:
 * - Event live chat: the host and approved attendees, while the event is active.
 * - Direct messages: accepted friends, or a host and an approved attendee of
 *   the same active event. Attendees who aren't friends use the live chat.
 * - A block in either direction stops all direct messages.
 * - A report pauses the reported sender's direct messages to that reporter for five hours.
 * Rights are checked on every send because friendships, approvals and blocks change.
 */

const MESSAGE_MAX_LENGTH = 2000
const PAGE_SIZE = 50
const AFTER_PAGE_SIZE = 100
const EVENT_CHAT_RETENTION_HOURS = 24
const DIRECT_MESSAGE_RETENTION_DAYS = 90
const REPORT_MESSAGE_COOLDOWN_HOURS = 5
const REPORT_REASONS = ['harassment', 'spam', 'inappropriate', 'safety', 'other']
const NO_MESSAGING = "You can't message this person right now."

let io = null
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 5 },
})
const ATTACHMENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])
const ATTACHMENT_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov',
  '.ogg', '.m4a', '.mp3', '.wav', '.pdf', '.txt', '.csv', '.doc',
  '.docx', '.xlsx', '.pptx',
])
const ATTACHMENT_EXTENSIONS_BY_TYPE = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
  'audio/webm': ['.webm'],
  'audio/ogg': ['.ogg'],
  'audio/mp4': ['.m4a'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
}
const PRESENCE_ROOM_PREFIX = 'presence:'

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
      deleted_for_everyone_at DATETIME NULL,
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
  await addMissingMessageColumn(pool, 'activity_chat_messages')
  await addMissingMessageColumn(pool, 'direct_messages')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_message_user_deletions (
      source ENUM('event', 'direct') NOT NULL,
      thread_id VARCHAR(80) NOT NULL,
      message_id BIGINT UNSIGNED NOT NULL,
      client_id BIGINT UNSIGNED NOT NULL,
      delete_at DATETIME NOT NULL,
      notified_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (source, message_id, client_id),
      KEY idx_chat_user_deletion_due (delete_at, notified_at),
      KEY idx_chat_user_deletion_client (client_id, source, thread_id)
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_message_restrictions (
      reporter_client_id BIGINT UNSIGNED NOT NULL,
      reported_client_id BIGINT UNSIGNED NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (reporter_client_id, reported_client_id),
      KEY idx_report_message_restrictions_expiry (expires_at),
      CONSTRAINT fk_report_restriction_reporter FOREIGN KEY (reporter_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE,
      CONSTRAINT fk_report_restriction_reported FOREIGN KEY (reported_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_attachments (
      attachment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      source ENUM('event', 'direct') NOT NULL,
      source_id VARCHAR(80) NOT NULL,
      message_id BIGINT UNSIGNED NOT NULL,
      uploader_client_id BIGINT UNSIGNED NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      file_size INT UNSIGNED NOT NULL,
      file_data LONGBLOB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (attachment_id),
      KEY idx_chat_attachments_message (source, message_id),
      KEY idx_chat_attachments_source (source, source_id),
      CONSTRAINT fk_chat_attachment_uploader FOREIGN KEY (uploader_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
}

async function addMissingMessageColumn(pool, table) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'deleted_for_everyone_at'`,
    [table],
  )
  if (!rows.length) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN deleted_for_everyone_at DATETIME NULL`)
  }
}

/*
 * TIMESTAMP columns are compared with NOW() (both in the session time zone),
 * so retention is exact whatever time zone the database runs in.
 */
export async function cleanupExpiredMessages(pool) {
  await pool.execute(
    `DELETE d FROM chat_message_user_deletions d
     JOIN activity_chat_messages m ON d.source = 'event' AND d.message_id = m.message_id
     WHERE m.created_at < NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR`,
  )
  await pool.execute(
    `DELETE a FROM chat_attachments a
     JOIN activity_chat_messages m ON m.message_id = a.message_id
     WHERE a.source = 'event'
       AND m.created_at < NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR`,
  )
  await pool.execute(
    `DELETE FROM activity_chat_messages
     WHERE created_at < NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR`,
  )
  await pool.execute(
    `DELETE d FROM chat_message_user_deletions d
     JOIN direct_messages m ON d.source = 'direct' AND d.message_id = m.message_id
     WHERE m.created_at < NOW() - INTERVAL ${DIRECT_MESSAGE_RETENTION_DAYS} DAY`,
  )
  await pool.execute(
    `DELETE a FROM chat_attachments a
     JOIN direct_messages m ON m.message_id = a.message_id
     WHERE a.source = 'direct'
       AND m.created_at < NOW() - INTERVAL ${DIRECT_MESSAGE_RETENTION_DAYS} DAY`,
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

function messagePayload(request) {
  if (!request.is('application/json') && !request.is('multipart/form-data')) {
    return { error: 'Send messages as JSON or multipart form data.' }
  }
  const rawText = typeof request.body?.text === 'string' ? request.body.text : ''
  const text = cleanMessageText(rawText)
  const files = request.files || []
  if (rawText.trim() && !text) {
    return { error: `Message must be between 1 and ${MESSAGE_MAX_LENGTH} characters.` }
  }
  if (!text && files.length === 0) return { error: 'Write a message or attach a file.' }
  if (files.reduce((total, file) => total + file.size, 0) > 24 * 1024 * 1024) {
    return { error: 'Attachments must total 24 MB or less per message.' }
  }
  for (const file of files) {
    file.mimetype = file.mimetype.split(';', 1)[0].trim().toLowerCase()
    if (!isValidAttachment(file)) {
      return { error: 'That file type is not supported or the file contents are invalid.' }
    }
  }
  return { text: text || '', files }
}

function isValidAttachment(file) {
  const extension = extname(file.originalname).toLowerCase()
  if (!ATTACHMENT_TYPES.has(file.mimetype) ||
      !ATTACHMENT_EXTENSIONS.has(extension) ||
      !ATTACHMENT_EXTENSIONS_BY_TYPE[file.mimetype]?.includes(extension)) return false
  const bytes = file.buffer
  const startsWith = (...values) => values.some((value) => bytes.subarray(0, value.length).equals(value))
  const hasFtyp = bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp'
  switch (file.mimetype) {
    case 'image/jpeg': return startsWith(Buffer.from([0xff, 0xd8, 0xff]))
    case 'image/png': return startsWith(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    case 'image/webp': return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    case 'image/gif': return startsWith(Buffer.from('GIF87a'), Buffer.from('GIF89a'))
    case 'video/mp4':
    case 'video/quicktime':
    case 'audio/mp4': return hasFtyp
    case 'video/webm':
    case 'audio/webm': return startsWith(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    case 'audio/ogg': return startsWith(Buffer.from('OggS'))
    case 'audio/wav': return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE'
    case 'audio/mpeg': return startsWith(Buffer.from('ID3')) || (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    case 'application/pdf': return startsWith(Buffer.from('%PDF-'))
    case 'application/msword': return startsWith(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      return startsWith(Buffer.from('PK\x03\x04'))
    case 'text/plain':
    case 'text/csv':
      return !bytes.subarray(0, Math.min(bytes.length, 1024)).includes(0)
    default: return false
  }
}

async function storeAttachments(db, source, sourceId, messageId, clientId, files) {
  for (const file of files) {
    const fileName = [...file.originalname]
      .map((character) => /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
        ? '_'
        : character)
      .join('')
      .trim()
      .replace(/^[. ]+|[. ]+$/g, '')
      .slice(0, 255) || 'attachment'
    await db.execute(
      `INSERT INTO chat_attachments
         (source, source_id, message_id, uploader_client_id, file_name, mime_type, file_size, file_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [source, String(sourceId), messageId, clientId, fileName, file.mimetype, file.size, file.buffer],
    )
  }
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
async function messagePage(rows, cursor, limit, db, source) {
  const page = rows.slice(0, limit)
  const messages = page.map(chatMessage)
  await addMessageAttachments(db, source, messages)
  return {
    messages: cursor.after ? messages : messages.reverse(),
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
  const deletedForEveryone = Boolean(row.deleted_for_everyone_at)
  return {
    id: String(row.message_id),
    text: deletedForEveryone ? '' : row.message_text,
    createdAt: new Date(Number(row.created_unix) * 1000).toISOString(),
    sender: chatSender(row),
    attachments: [],
    deletedForEveryone,
  }
}

const MESSAGE_COLUMNS = `m.message_id, m.message_text, UNIX_TIMESTAMP(m.created_at) AS created_unix,
  m.deleted_for_everyone_at, c.client_id, c.full_name, c.profile_photo_mime`

function attachmentMetadata(row) {
  return {
    id: String(row.attachment_id),
    name: row.file_name,
    mimeType: row.mime_type,
    size: Number(row.file_size),
    url: `/api/chat/attachments/${row.attachment_id}`,
  }
}

async function addMessageAttachments(db, source, messages) {
  const visibleMessages = messages.filter((message) => !message.deletedForEveryone)
  if (!visibleMessages.length) return messages
  const ids = visibleMessages.map((message) => message.id)
  const [rows] = await db.execute(
    `SELECT attachment_id, message_id, file_name, mime_type, file_size
     FROM chat_attachments
     WHERE source = ? AND message_id IN (${ids.map(() => '?').join(',')})
     ORDER BY attachment_id`,
    [source, ...ids],
  )
  const byMessage = new Map()
  for (const row of rows) {
    const key = String(row.message_id)
    if (!byMessage.has(key)) byMessage.set(key, [])
    byMessage.get(key).push(attachmentMetadata(row))
  }
  for (const message of visibleMessages) message.attachments = byMessage.get(message.id) || []
  return messages
}

async function loadMessage(db, table, source, messageId) {
  const [rows] = await db.execute(
    `SELECT ${MESSAGE_COLUMNS}
     FROM ${table} m JOIN clients c
       ON c.client_id = m.sender_client_id AND c.account_status = 'active'
     WHERE m.message_id = ? LIMIT 1`,
    [messageId],
  )
  const [message] = await addMessageAttachments(db, source, [chatMessage(rows[0])])
  return message
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
  const [accounts] = await db.execute(
    `SELECT client_id FROM clients
     WHERE client_id IN (?, ?) AND account_status = 'active'`,
    [senderId, recipientId],
  )
  if (accounts.length !== 2) return { allowed: false, reason: 'unavailable' }
  const blocks = await blockStatus(db, senderId, recipientId)
  if (blocks.byMe) return { allowed: false, reason: 'blocked' }
  if (blocks.byThem) return { allowed: false, reason: 'unavailable' }

  const [restrictions] = await db.execute(
    `SELECT expires_at FROM report_message_restrictions
     WHERE reporter_client_id = ? AND reported_client_id = ?
       AND expires_at > UTC_TIMESTAMP()
     LIMIT 1`,
    [recipientId, senderId],
  )
  if (restrictions[0]) {
    return { allowed: false, reason: 'report_cooldown', sendAvailableAt: restrictions[0].expires_at }
  }

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
       AND EXISTS (SELECT 1 FROM clients hc
                   WHERE hc.client_id = a.host_client_id AND hc.account_status = 'active')
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

async function eventMessageRestriction(db, activityId, senderId) {
  const [rows] = await db.execute(
    `SELECT r.expires_at
     FROM report_message_restrictions r
     WHERE r.reported_client_id = ? AND r.expires_at > UTC_TIMESTAMP()
       AND (
         r.reporter_client_id = (
           SELECT host_client_id FROM activities WHERE activity_id = ?
         )
         OR EXISTS (
           SELECT 1 FROM activity_join_requests jr
           WHERE jr.activity_id = ? AND jr.applicant_client_id = r.reporter_client_id
             AND jr.status = 'approved'
         )
       )
     ORDER BY r.expires_at DESC
     LIMIT 1`,
    [senderId, activityId, activityId],
  )
  return rows[0] ?? null
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
     JOIN clients c ON c.client_id = members.client_id AND c.account_status = 'active'
     WHERE NOT EXISTS (
       SELECT 1 FROM user_blocks b
       WHERE b.blocker_client_id = members.client_id AND b.blocked_client_id = ?
     )`,
    [activityId, activityId, senderId],
  )
  return rows.map((row) => Number(row.client_id))
}

function mysqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function scheduledDeleteDate(value) {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  const delay = date.getTime() - Date.now()
  return Number.isNaN(delay) || delay < 60 * 1000 || delay > 30 * 24 * 60 * 60 * 1000
    ? null
    : date
}

async function applyMessageDeletion({
  pool,
  request,
  response,
  source,
  threadId,
  messageId,
  table,
  threadColumn,
  threadValue,
  peerId = null,
  activity = null,
}) {
  if (!isId(messageId)) {
    return response.status(400).json({ message: 'Invalid message.' })
  }
  if (!request.is('application/json')) {
    return response.status(415).json({ message: 'Send this request as JSON.' })
  }

  const action = request.body?.action
  if (!['for_me', 'schedule_for_me', 'for_everyone'].includes(action)) {
    return response.status(400).json({ message: 'Choose a valid delete option.' })
  }
  const deleteAt = action === 'schedule_for_me'
    ? scheduledDeleteDate(request.body?.deleteAt)
    : null
  if (action === 'schedule_for_me' && !deleteAt) {
    return response.status(400).json({ message: 'Choose a delete time between one minute and 30 days from now.' })
  }

  const [rows] = await pool.execute(
    `SELECT m.message_id, m.sender_client_id, m.deleted_for_everyone_at,
            UNIX_TIMESTAMP(m.created_at) AS created_unix
     FROM ${table} m
     WHERE m.${threadColumn} = ? AND m.message_id = ?
     LIMIT 1`,
    [threadValue, messageId],
  )
  const message = rows[0]
  if (!message || message.deleted_for_everyone_at) {
    return response.status(404).json({ message: 'This message is no longer available.' })
  }
  if (action === 'for_everyone') {
    const sentAt = Number(message.created_unix) * 1000
    if (Number(message.sender_client_id) !== request.clientId) {
      return response.status(403).json({ message: 'You can only delete your own messages for everyone.' })
    }
    if (Date.now() - sentAt > 15 * 60 * 1000 || Date.now() < sentAt) {
      return response.status(403).json({ message: 'Messages can only be deleted for everyone within 15 minutes of sending.' })
    }
    const [updated] = await pool.execute(
      `UPDATE ${table}
       SET deleted_for_everyone_at = NOW()
       WHERE ${threadColumn} = ? AND message_id = ?
         AND sender_client_id = ? AND deleted_for_everyone_at IS NULL
         AND created_at >= NOW() - INTERVAL 15 MINUTE`,
      [threadValue, messageId, request.clientId],
    )
    if (updated.affectedRows !== 1) {
      return response.status(409).json({ message: 'This message can no longer be deleted for everyone.' })
    }
    await pool.execute(
      'DELETE FROM chat_attachments WHERE source = ? AND message_id = ?',
      [source, messageId],
    )
    const recipients = source === 'event'
      ? await eventChatRecipients(pool, activity.activity_id, request.clientId)
      : [request.clientId, peerId]
    emitToUsers(recipients, 'message:deleted-for-everyone', {
      kind: source,
      threadId: String(threadId),
      messageId: String(messageId),
    })
    return response.json({ action, messageId: String(messageId) })
  }

  if (action === 'for_me') {
    await pool.execute(
      `INSERT INTO chat_message_user_deletions
         (source, thread_id, message_id, client_id, delete_at, notified_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE delete_at = NOW(), notified_at = NOW()`,
      [source, String(threadId), messageId, request.clientId],
    )
    emitToUsers([request.clientId], 'message:deleted-for-me', {
      kind: source,
      threadId: String(threadId),
      messageId: String(messageId),
    })
    return response.json({ action, messageId: String(messageId) })
  }

  await pool.execute(
    `INSERT INTO chat_message_user_deletions
       (source, thread_id, message_id, client_id, delete_at, notified_at)
     VALUES (?, ?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE delete_at = VALUES(delete_at), notified_at = NULL`,
    [source, String(threadId), messageId, request.clientId, mysqlDateTime(deleteAt)],
  )
  response.json({ action, messageId: String(messageId), deleteAt: deleteAt.toISOString() })
}

async function processScheduledMessageDeletions(pool) {
  if (!io) return
  const [rows] = await pool.execute(
    `SELECT source, thread_id, message_id, client_id
     FROM chat_message_user_deletions
     WHERE delete_at <= NOW() AND notified_at IS NULL
     ORDER BY delete_at ASC LIMIT 100`,
  )
  for (const row of rows) {
    emitToUsers([row.client_id], 'message:deleted-for-me', {
      kind: row.source,
      threadId: row.thread_id,
      messageId: String(row.message_id),
    })
    await pool.execute(
      `UPDATE chat_message_user_deletions SET notified_at = NOW()
       WHERE source = ? AND message_id = ? AND client_id = ? AND notified_at IS NULL`,
      [row.source, row.message_id, row.client_id],
    )
  }
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

export function disconnectUser(clientId, reason) {
  if (!io) return
  io.to(userRoom(clientId)).emit('account:ended', { reason })
  setTimeout(() => io.in(userRoom(clientId)).disconnectSockets(true), 300).unref()
}

export function getSocketStats() {
  if (!io) return { connections: 0, users: 0 }
  const users = [...io.of('/').adapter.rooms.keys()].filter((room) => room.startsWith('user:')).length
  return { connections: io.engine.clientsCount, users }
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
export function attachChatSocket(httpServer, { cookieName, frontendOrigins, isAllowedOrigin, resolveSession }) {
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
  function isOnline(clientId) {
    return io.in(userRoom(clientId)).fetchSockets().then((sockets) => sockets.length > 0)
  }
  io.use(async (socket, next) => {
    try {
      const token = socket.request.cookies?.[cookieName]
      const session = token ? await resolveSession(token) : null
      if (!session?.clientId) return next(new Error('unauthorized'))
      socket.data.clientId = session.clientId
      socket.data.expiresAt = session.expiresAt
      return next()
    } catch (error) {
      console.error('Socket authentication failed:', error)
      return next(new Error('unauthorized'))
    }
  })
  io.on('connection', (socket) => {
    const clientId = socket.data.clientId
    socket.join(userRoom(clientId))
    io.to(`${PRESENCE_ROOM_PREFIX}${clientId}`).emit('presence:update', { userId: clientId, online: true })
    const watched = new Set()
    socket.on('presence:watch', async (payload) => {
      const rawId = String(payload?.userId ?? '')
      if (!/^\d{1,19}$/.test(rawId)) return
      const targetId = Number(rawId)
      if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === clientId || watched.size >= 50) return
      watched.add(targetId)
      await socket.join(`${PRESENCE_ROOM_PREFIX}${targetId}`)
      socket.emit('presence:update', { userId: targetId, online: await isOnline(targetId) })
    })
    socket.on('presence:unwatch', async (payload) => {
      const rawId = String(payload?.userId ?? '')
      if (!/^\d{1,19}$/.test(rawId)) return
      const targetId = Number(rawId)
      if (!watched.delete(targetId)) return
      await socket.leave(`${PRESENCE_ROOM_PREFIX}${targetId}`)
    })
    const remaining = Math.min(Math.max(socket.data.expiresAt - Date.now(), 0), 2 ** 31 - 1)
    const expiryTimer = setTimeout(() => socket.disconnect(true), remaining)
    socket.on('disconnect', () => {
      clearTimeout(expiryTimer)
      setImmediate(async () => {
        if (!(await isOnline(clientId))) {
          io.to(`${PRESENCE_ROOM_PREFIX}${clientId}`).emit('presence:update', { userId: clientId, online: false })
        }
      })
    })
  })
  return io
}

/* -------------------------------------------------------------------------- */
/* Inbox                                                                      */
/* -------------------------------------------------------------------------- */

async function loadInbox(pool, meId) {
  const [eventRows] = await pool.execute(
    `SELECT a.public_id, a.title, a.banner_image, a.ends_at, a.host_client_id,
            lm.message_id AS last_message_id,
            CASE WHEN lm.deleted_for_everyone_at IS NULL THEN lm.message_text
                 ELSE 'This message was deleted' END AS last_text,
            UNIX_TIMESTAMP(lm.created_at) AS last_unix,
            lm.sender_client_id AS last_sender_id, lc.full_name AS last_sender_name,
            (SELECT COUNT(*) FROM activity_chat_messages um
             WHERE um.activity_id = a.activity_id AND um.sender_client_id <> ?
               AND um.message_id > COALESCE(r.last_read_message_id, 0)
               AND um.created_at >= NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR
               AND um.deleted_for_everyone_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM user_blocks b
                               WHERE b.blocker_client_id = ? AND b.blocked_client_id = um.sender_client_id)
               AND NOT EXISTS (SELECT 1 FROM chat_message_user_deletions d
                               WHERE d.source = 'event' AND d.message_id = um.message_id
                                 AND d.client_id = ? AND d.delete_at <= NOW())
            ) AS unread_count
     FROM activities a
     LEFT JOIN activity_chat_reads r ON r.activity_id = a.activity_id AND r.client_id = ?
     LEFT JOIN activity_chat_messages lm ON lm.message_id = (
       SELECT MAX(m2.message_id) FROM activity_chat_messages m2
       WHERE m2.activity_id = a.activity_id
         AND m2.created_at >= NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR
         AND NOT EXISTS (SELECT 1 FROM user_blocks b
                         WHERE b.blocker_client_id = ? AND b.blocked_client_id = m2.sender_client_id)
         AND NOT EXISTS (SELECT 1 FROM chat_message_user_deletions d
                         WHERE d.source = 'event' AND d.message_id = m2.message_id
                           AND d.client_id = ? AND d.delete_at <= NOW())
     )
     LEFT JOIN clients lc ON lc.client_id = lm.sender_client_id
     WHERE a.status = 'active' AND a.ends_at > UTC_TIMESTAMP()
       AND (a.host_client_id = ? OR EXISTS (
         SELECT 1 FROM activity_join_requests jr
         WHERE jr.activity_id = a.activity_id
           AND jr.applicant_client_id = ? AND jr.status = 'approved'))
     ORDER BY COALESCE(lm.message_id, 0) DESC, a.starts_at ASC`,
    [meId, meId, meId, meId, meId, meId, meId, meId],
  )

  const [directRows] = await pool.execute(
    `SELECT other.client_id, other.full_name, other.profile_photo_mime,
            lm.message_id AS last_message_id,
            CASE WHEN lm.deleted_for_everyone_at IS NULL THEN lm.message_text
                 ELSE 'This message was deleted' END AS last_text,
            UNIX_TIMESTAMP(lm.created_at) AS last_unix, lm.sender_client_id AS last_sender_id,
            (SELECT COUNT(*) FROM direct_messages um
             WHERE um.conversation_id = dc.conversation_id AND um.sender_client_id <> ?
               AND um.message_id > IF(dc.client_low_id = ?, dc.low_last_read_id, dc.high_last_read_id)
               AND um.deleted_for_everyone_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM chat_message_user_deletions d
                               WHERE d.source = 'direct' AND d.message_id = um.message_id
                                 AND d.client_id = ? AND d.delete_at <= NOW())
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
       AND other.account_status = 'active'
     JOIN direct_messages lm ON lm.message_id = (
       SELECT MAX(m2.message_id) FROM direct_messages m2
       WHERE m2.conversation_id = dc.conversation_id
         AND NOT EXISTS (SELECT 1 FROM chat_message_user_deletions d
                         WHERE d.source = 'direct' AND d.message_id = m2.message_id
                           AND d.client_id = ? AND d.delete_at <= NOW())
     )
     WHERE dc.client_low_id = ? OR dc.client_high_id = ?
     ORDER BY lm.message_id DESC
     LIMIT 100`,
    [meId, meId, meId, meId, meId, meId, meId, meId, meId, meId, meId],
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
  const scheduledDeletionTimer = setInterval(() => {
    processScheduledMessageDeletions(pool).catch((error) =>
      console.error('Failed to process scheduled chat message deletions:', error),
    )
  }, 15 * 1000)
  scheduledDeletionTimer.unref()

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
         JOIN clients c ON c.client_id = m.sender_client_id AND c.account_status = 'active'
         WHERE m.activity_id = ?
           AND m.created_at >= NOW() - INTERVAL ${EVENT_CHAT_RETENTION_HOURS} HOUR
           ${page.where}
           AND NOT EXISTS (SELECT 1 FROM user_blocks b
                           WHERE b.blocker_client_id = ? AND b.blocked_client_id = m.sender_client_id)
           AND NOT EXISTS (SELECT 1 FROM chat_message_user_deletions d
                           WHERE d.source = 'event' AND d.message_id = m.message_id
                             AND d.client_id = ? AND d.delete_at <= NOW())
         ORDER BY m.message_id ${page.order}
         LIMIT ${page.limit + 1}`,
        [access.activity.activity_id, ...page.params, request.clientId, request.clientId],
      )
      response.set('Cache-Control', 'private, no-store')
      const restriction = await eventMessageRestriction(pool, access.activity.activity_id, request.clientId)
      response.json({
        ...await messagePage(rows, cursor, page.limit, pool, 'event'),
        title: access.activity.title,
        canSend: !restriction,
        reason: restriction ? 'report_cooldown' : null,
        sendAvailableAt: restriction?.expires_at ?? null,
      })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/activities/:id/chat/:messageId', requireSession, async (request, response, next) => {
    try {
      const access = await eventChatAccess(pool, request.params.id, request.clientId)
      if (!access.activity || !access.allowed) {
        return response.status(404).json({ message: 'Chat not found.' })
      }
      await applyMessageDeletion({
        pool,
        request,
        response,
        source: 'event',
        threadId: access.activity.public_id,
        messageId: request.params.messageId,
        table: 'activity_chat_messages',
        threadColumn: 'activity_id',
        threadValue: access.activity.activity_id,
        activity: access.activity,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/activities/:id/chat', requireSession, messageLimiter, attachmentUpload.array('files', 5), async (request, response, next) => {
    const payload = messagePayload(request)
    if (payload.error) return response.status(400).json({ message: payload.error })
    try {
      const access = await eventChatAccess(pool, request.params.id, request.clientId)
      if (!access.activity) return response.status(404).json({ message: 'Event is no longer active.' })
      if (!access.allowed) return response.status(403).json({ message: 'Live chat is available only to the host and approved attendees.' })
      const connection = await pool.getConnection()
      let messageId
      try {
        await connection.beginTransaction()
        const restriction = await eventMessageRestriction(
          connection,
          access.activity.activity_id,
          request.clientId,
        )
        if (restriction) {
          await connection.rollback()
          return response.status(403).json({
            message: NO_MESSAGING,
            reason: 'report_cooldown',
            sendAvailableAt: restriction.expires_at,
          })
        }
        const [result] = await connection.execute(
          `INSERT INTO activity_chat_messages (activity_id, sender_client_id, message_text)
           VALUES (?, ?, ?)`,
          [access.activity.activity_id, request.clientId, payload.text],
        )
        messageId = result.insertId
        await storeAttachments(connection, 'event', access.activity.public_id, messageId, request.clientId, payload.files)
        await connection.execute(
          `INSERT INTO activity_chat_reads (activity_id, client_id, last_read_message_id)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             last_read_message_id = GREATEST(last_read_message_id, VALUES(last_read_message_id))`,
          [access.activity.activity_id, request.clientId, messageId],
        )
        await connection.execute(
          'UPDATE activities SET chat_message_count = chat_message_count + 1 WHERE activity_id = ?',
          [access.activity.activity_id],
        )
        await connection.commit()
      } catch (error) {
        await connection.rollback()
        throw error
      } finally {
        connection.release()
      }
      countDaily(pool, 'event_messages').catch((error) =>
        console.error('Failed to count event chat message:', error),
      )
      const message = await loadMessage(pool, 'activity_chat_messages', 'event', messageId)
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
        `SELECT client_id, full_name, profile_photo_mime FROM clients
         WHERE client_id = ? AND account_status = 'active' LIMIT 1`,
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
           JOIN clients c ON c.client_id = m.sender_client_id AND c.account_status = 'active'
           WHERE m.conversation_id = ? ${query.where}
             AND NOT EXISTS (SELECT 1 FROM chat_message_user_deletions d
                             WHERE d.source = 'direct' AND d.message_id = m.message_id
                               AND d.client_id = ? AND d.delete_at <= NOW())
           ORDER BY m.message_id ${query.order}
           LIMIT ${query.limit + 1}`,
          [conversation.conversation_id, ...query.params, request.clientId],
        )
        page = await messagePage(rows, cursor, query.limit, pool, 'direct')
      }
      response.set('Cache-Control', 'private, no-store')
      response.json({
        ...page,
        person: chatSender(people[0]),
        ...(await relationshipBetween(pool, request.clientId, personId)),
        canSend: rights.allowed,
        reason: rights.reason ?? null,
        sendAvailableAt: rights.sendAvailableAt ?? null,
      })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/dm/:personId/messages/:messageId', requireSession, async (request, response, next) => {
    const personId = personIdParam(request)
    if (!personId) return response.status(400).json({ message: 'Invalid person.' })
    try {
      const [conversations] = await pool.execute(
        `SELECT conversation_id FROM direct_conversations
         WHERE client_low_id = LEAST(?, ?) AND client_high_id = GREATEST(?, ?) LIMIT 1`,
        [request.clientId, personId, request.clientId, personId],
      )
      if (!conversations[0]) {
        return response.status(404).json({ message: 'Conversation not found.' })
      }
      await applyMessageDeletion({
        pool,
        request,
        response,
        source: 'direct',
        threadId: String(personId),
        messageId: request.params.messageId,
        table: 'direct_messages',
        threadColumn: 'conversation_id',
        threadValue: conversations[0].conversation_id,
        peerId: personId,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/dm/:personId/messages', requireSession, messageLimiter, attachmentUpload.array('files', 5), async (request, response, next) => {
    const personId = personIdParam(request)
    if (!personId) return response.status(400).json({ message: 'Invalid person.' })
    const payload = messagePayload(request)
    if (payload.error) return response.status(400).json({ message: payload.error })
    if (!getSetting('dms_enabled')) {
      return response.status(403).json({
        code: 'DMS_DISABLED',
        message: 'Direct messages are paused right now. Please try again later.',
      })
    }
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
        [conversation.insertId, request.clientId, payload.text],
      )
      await storeAttachments(connection, 'direct', personId, inserted.insertId, request.clientId, payload.files)
      const readColumn = request.clientId < personId ? 'low_last_read_id' : 'high_last_read_id'
      await connection.execute(
        `UPDATE direct_conversations SET ${readColumn} = ? WHERE conversation_id = ?`,
        [inserted.insertId, conversation.insertId],
      )
      await connection.commit()
      countDaily(pool, 'direct_messages').catch((error) =>
        console.error('Failed to count direct message:', error),
      )
      const message = await loadMessage(pool, 'direct_messages', 'direct', inserted.insertId)
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

  app.get('/api/chat/attachments/:id', requireSession, async (request, response, next) => {
    if (!/^\d{1,19}$/.test(request.params.id)) {
      return response.status(400).json({ message: 'Invalid attachment.' })
    }
    try {
      const [attachments] = await pool.execute(
        `SELECT attachment_id, source, source_id, message_id, uploader_client_id, file_name, mime_type, file_data
         FROM chat_attachments WHERE attachment_id = ? LIMIT 1`,
        [request.params.id],
      )
      const attachment = attachments[0]
      if (!attachment) return response.status(404).json({ message: 'Attachment not found.' })

      if (attachment.source === 'event') {
        const access = await eventChatAccess(pool, attachment.source_id, request.clientId)
        if (!access.activity || !access.allowed) return response.status(404).json({ message: 'Attachment not found.' })
        const blocks = await blockStatus(pool, request.clientId, Number(attachment.uploader_client_id))
        if (blocks.byMe) return response.status(404).json({ message: 'Attachment not found.' })
        const [visible] = await pool.execute(
          `SELECT 1 FROM activity_chat_messages m
           WHERE m.activity_id = ? AND m.message_id = ?
             AND m.deleted_for_everyone_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM chat_message_user_deletions d
                             WHERE d.source = 'event' AND d.message_id = m.message_id
                               AND d.client_id = ? AND d.delete_at <= NOW())
           LIMIT 1`,
          [access.activity.activity_id, attachment.message_id, request.clientId],
        )
        if (!visible[0]) return response.status(404).json({ message: 'Attachment not found.' })
      } else {
        const [conversations] = await pool.execute(
          `SELECT 1 FROM direct_messages m
           JOIN direct_conversations dc ON dc.conversation_id = m.conversation_id
           WHERE m.message_id = ? AND m.deleted_for_everyone_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM chat_message_user_deletions d
                             WHERE d.source = 'direct' AND d.message_id = m.message_id
                               AND d.client_id = ? AND d.delete_at <= NOW())
             AND (
             (dc.client_low_id = ? AND dc.client_high_id = CAST(? AS UNSIGNED))
             OR (dc.client_high_id = ? AND dc.client_low_id = CAST(? AS UNSIGNED))
           ) LIMIT 1`,
          [attachment.message_id, request.clientId, request.clientId, attachment.source_id, request.clientId, attachment.source_id],
        )
        if (!conversations[0]) return response.status(404).json({ message: 'Attachment not found.' })
      }

      const safeName = attachment.file_name
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/[\r\n"]/g, '_')
      const disposition = attachment.mime_type.startsWith('image/') ||
        attachment.mime_type.startsWith('audio/') || attachment.mime_type.startsWith('video/')
        ? 'inline'
        : 'attachment'
      response.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': attachment.mime_type,
        'Content-Disposition': `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(attachment.file_name)}`,
        'X-Content-Type-Options': 'nosniff',
      })
      response.send(attachment.file_data)
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
    let connection
    try {
      let message
      if (source === 'event') {
        const [rows] = await pool.execute(
          `SELECT m.message_text, m.sender_client_id, a.public_id, a.activity_id
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
      connection = await pool.getConnection()
      await connection.beginTransaction()
      const [report] = await connection.execute(
        `INSERT IGNORE INTO message_reports
           (reporter_client_id, reported_client_id, source, message_id, message_snapshot, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [request.clientId, message.sender_client_id, source, messageId, message.message_text, reason],
      )
      const isNewReport = report.affectedRows === 1
      let reportId = report.insertId
      if (!isNewReport) {
        const [existingReports] = await connection.execute(
          `SELECT report_id FROM message_reports
           WHERE reporter_client_id = ? AND source = ? AND message_id = ?
           LIMIT 1`,
          [request.clientId, source, messageId],
        )
        reportId = existingReports[0]?.report_id
        if (!reportId) throw new Error('The existing message report could not be found.')
      }

      const reportedId = Number(message.sender_client_id)
      const cooldownSeconds = REPORT_MESSAGE_COOLDOWN_HOURS * 60 * 60
      await connection.execute(
        `INSERT INTO report_message_restrictions
           (reporter_client_id, reported_client_id, expires_at)
         SELECT reporter_client_id, reported_client_id,
                DATE_ADD(UTC_TIMESTAMP(), INTERVAL GREATEST(
                  0, ${cooldownSeconds} - TIMESTAMPDIFF(SECOND, created_at, CURRENT_TIMESTAMP())
                ) SECOND)
         FROM message_reports
         WHERE report_id = ? AND created_at > CURRENT_TIMESTAMP() - INTERVAL ${REPORT_MESSAGE_COOLDOWN_HOURS} HOUR
         ON DUPLICATE KEY UPDATE expires_at = GREATEST(expires_at, VALUES(expires_at))`,
        [reportId],
      )
      const [activeRestrictions] = await connection.execute(
        `SELECT expires_at,
                GREATEST(0, TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), expires_at)) AS minutes_remaining
         FROM report_message_restrictions
         WHERE reporter_client_id = ? AND reported_client_id = ?
           AND expires_at > UTC_TIMESTAMP()
         LIMIT 1`,
        [request.clientId, reportedId],
      )
      const remainingMinutes = Number(activeRestrictions[0]?.minutes_remaining ?? 0)
      const remainingHours = Math.ceil(remainingMinutes / 60)
      const warningMessage = activeRestrictions[0]
        ? `We are reviewing a message you sent. For safety, messaging the person who reported it is paused for up to ${remainingHours} ${remainingHours === 1 ? 'hour' : 'hours'}. The pause lifts automatically. Please review Spontii’s community guidelines.`
        : 'A message you sent was reported and shared with Spontii for review. Please review Spontii’s community guidelines.'
      const [notification] = await connection.execute(
        `INSERT IGNORE INTO notifications
           (client_id, type, title, message, route, dedupe_key)
         VALUES (?, 'report_warning', 'A message you sent was reported', ?, NULL, ?)`,
        [reportedId, warningMessage, `report-warning:${reportId}`],
      )
      await connection.commit()

      if (notification.affectedRows === 1) {
        emitToUsers([reportedId], 'notification:new', {
          id: String(notification.insertId),
          type: 'report_warning',
          title: 'A message you sent was reported',
          message: warningMessage,
          route: null,
          readAt: null,
          createdAt: new Date().toISOString(),
        })
      }
      notifyInBackground(
        notifyDirectAccess(pool, request.clientId, reportedId),
        'update direct message access after a message report',
      )
      if (activeRestrictions[0] && source === 'event') {
        emitToUsers([reportedId], 'thread:access', {
          kind: 'event',
          threadId: message.public_id,
          canSend: false,
          reason: 'report_cooldown',
        })
      }
      response.status(201).json({ status: isNewReport ? 'reported' : 'already_reported' })
    } catch (error) {
      if (connection) await connection.rollback()
      next(error)
    } finally {
      connection?.release()
    }
  })
}
