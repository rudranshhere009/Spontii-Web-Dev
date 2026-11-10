import { afterEventsClosed, closeEventAsAdmin, insertNotification } from './actions.js'
import { writeAudit } from './audit.js'
import {
  HttpError,
  cleanReason,
  idParam,
  iso,
  jsonValue,
  likePattern,
  pageParams,
  pageResult,
  textParam,
  ts,
  withTransaction,
} from './util.js'

const VISIBILITIES = ['public', 'friends', 'private']
const SORTS = {
  starts: 'a.starts_at ASC',
  newest: 'a.created_at DESC',
  requests: 'pending_count DESC, a.starts_at ASC',
}

/* Event times are stored as UTC DATETIMEs, which mysql2 (timezone 'Z') already reads correctly. */
const utc = (value) => (value ? new Date(value).toISOString() : null)

const EVENT_LIST_COLUMNS = `a.activity_id, a.public_id, a.title, a.category, a.visibility, a.city, a.state, a.area,
  a.status, a.completed_by, a.capacity, a.starts_at, a.ends_at, a.chat_message_count, ${ts('a.created_at')},
  a.host_client_id, c.full_name AS host_name, c.account_status AS host_status,
  (SELECT COUNT(*) FROM activity_join_requests jr WHERE jr.activity_id = a.activity_id AND jr.status = 'approved') AS approved_count,
  (SELECT COUNT(*) FROM activity_join_requests jr WHERE jr.activity_id = a.activity_id AND jr.status = 'pending') AS pending_count,
  (SELECT COUNT(*) FROM message_reports r WHERE r.source = 'event' AND r.context_id = a.public_id) AS report_count`

function listEvent(row) {
  return {
    id: row.public_id,
    title: row.title,
    category: row.category,
    visibility: row.visibility,
    city: row.city,
    state: row.state,
    area: row.area,
    status: row.status === 'active' ? 'live' : row.status,
    completedBy: row.completed_by,
    capacity: Number(row.capacity),
    attendees: Number(row.approved_count) + 1,
    pendingRequests: Number(row.pending_count),
    reports: Number(row.report_count),
    chatMessages: Number(row.chat_message_count),
    startsAt: utc(row.starts_at),
    endsAt: utc(row.ends_at),
    createdAt: iso(row.created_at),
    host: { id: Number(row.host_client_id), name: row.host_name, status: row.host_status },
  }
}

function archivedEvent(row) {
  return {
    id: row.public_id,
    title: row.title,
    category: row.category,
    visibility: row.visibility,
    vibe: row.vibe,
    city: row.city,
    state: row.state,
    area: row.area,
    status: 'archived',
    completedBy: row.completed_by,
    capacity: Number(row.capacity),
    attendees: Number(row.approved_count) + 1,
    counts: {
      approved: Number(row.approved_count),
      pending: Number(row.pending_count),
      rejected: Number(row.rejected_count),
      removed: Number(row.removed_count),
      images: Number(row.image_count),
      videos: Number(row.video_count),
      chatMessages: Number(row.chat_message_count),
      reports: Number(row.report_count),
    },
    tags: jsonValue(row.event_tags, []),
    coordinates: row.latitude != null ? [Number(row.latitude), Number(row.longitude)] : null,
    startsAt: utc(row.starts_at),
    endsAt: utc(row.ends_at),
    createdAt: iso(row.event_created_at),
    archivedAt: iso(row.archived_at),
    host: { id: row.host_client_id ? Number(row.host_client_id) : null, name: row.host_name },
  }
}

function eventFilters(query) {
  const where = []
  const params = []
  if (query.status === 'completed') where.push("a.status = 'completed'")
  else if (query.status !== 'all') where.push("a.status = 'active'")
  if (VISIBILITIES.includes(query.visibility)) {
    where.push('a.visibility = ?')
    params.push(query.visibility)
  }
  const q = textParam(query.q, 120)
  if (q) {
    where.push('(a.title LIKE ? OR a.public_id = ? OR c.full_name LIKE ?)')
    params.push(likePattern(q), q, likePattern(q))
  }
  const place = textParam(query.place, 80)
  if (place) {
    where.push('(a.city LIKE ? OR a.state LIKE ?)')
    params.push(likePattern(place), likePattern(place))
  }
  const hostId = idParam(query.hostId)
  if (hostId) {
    where.push('a.host_client_id = ?')
    params.push(hostId)
  }
  return { sql: where.length ? where.join(' AND ') : '1 = 1', params, order: SORTS[query.sort] || SORTS.starts }
}

export function registerEventRoutes(router, deps) {
  const { pool } = deps

  async function loadActivity(db, publicId, lock = false) {
    const [rows] = await db.execute(
      `SELECT activity_id, public_id, host_client_id, title, status FROM activities
       WHERE public_id = ? LIMIT 1 ${lock ? 'FOR UPDATE' : ''}`,
      [publicId],
    )
    if (!rows[0]) throw new HttpError(404, 'Event not found. It may have ended and been archived.')
    return rows[0]
  }

  router.get('/events', async (request, response) => {
    const filters = eventFilters(request.query)
    const page = pageParams(request.query)
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM activities a JOIN clients c ON c.client_id = a.host_client_id WHERE ${filters.sql}`,
      filters.params,
    )
    const [rows] = await pool.execute(
      `SELECT ${EVENT_LIST_COLUMNS}
       FROM activities a JOIN clients c ON c.client_id = a.host_client_id
       WHERE ${filters.sql} ORDER BY ${filters.order} ${page.sql}`,
      filters.params,
    )
    response.json(pageResult(rows.map(listEvent), total, page))
  })

  router.get('/events/archive', async (request, response) => {
    const where = ['1 = 1']
    const params = []
    const q = textParam(request.query.q, 120)
    if (q) {
      where.push('(title LIKE ? OR public_id = ? OR host_name LIKE ?)')
      params.push(likePattern(q), q, likePattern(q))
    }
    const place = textParam(request.query.place, 80)
    if (place) {
      where.push('(city LIKE ? OR state LIKE ?)')
      params.push(likePattern(place), likePattern(place))
    }
    if (['host', 'system', 'admin'].includes(request.query.completedBy)) {
      where.push('completed_by = ?')
      params.push(request.query.completedBy)
    }
    const hostId = idParam(request.query.hostId)
    if (hostId) {
      where.push('host_client_id = ?')
      params.push(hostId)
    }
    const page = pageParams(request.query)
    const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM activity_archive WHERE ${where.join(' AND ')}`, params)
    const [rows] = await pool.execute(
      `SELECT *, ${ts('event_created_at')}, ${ts('archived_at')} FROM activity_archive
       WHERE ${where.join(' AND ')} ORDER BY ends_at DESC ${page.sql}`,
      params,
    )
    response.json(pageResult(rows.map(archivedEvent), total, page))
  })

  router.get('/events/:publicId', async (request, response) => {
    const publicId = textParam(request.params.publicId, 36)
    const [rows] = await pool.execute(
      `SELECT ${EVENT_LIST_COLUMNS}, a.description, a.vibe, a.venue_name, a.venue_address, a.landmark,
              a.latitude, a.longitude, a.join_request_cutoff_minutes, a.food_available, a.food_preference,
              a.beverages_available, a.drinks_available, a.attendee_preference, a.experience_level,
              a.preferences, a.event_tags, a.banner_image, c.email AS host_email
       FROM activities a JOIN clients c ON c.client_id = a.host_client_id
       WHERE a.public_id = ? LIMIT 1`,
      [publicId],
    )
    if (!rows[0]) {
      const [archived] = await pool.execute(
        `SELECT *, ${ts('event_created_at')}, ${ts('archived_at')} FROM activity_archive WHERE public_id = ? LIMIT 1`,
        [publicId],
      )
      if (!archived[0]) throw new HttpError(404, 'Event not found.')
      return response.json({ event: archivedEvent(archived[0]), archived: true })
    }
    const row = rows[0]
    const [people] = await pool.execute(
      `SELECT jr.request_id, jr.status, ${ts('jr.created_at')}, ${ts('jr.reviewed_at')},
              c.client_id, c.full_name, c.account_status
       FROM activity_join_requests jr JOIN clients c ON c.client_id = jr.applicant_client_id
       WHERE jr.activity_id = ? ORDER BY jr.created_at ASC`,
      [row.activity_id],
    )
    const [media] = await pool.execute(
      `SELECT media_id, media_kind, mime_type, original_name, LENGTH(media_data) AS bytes, ${ts('created_at')}
       FROM activity_media WHERE activity_id = ? ORDER BY media_id`,
      [row.activity_id],
    )
    const [reports] = await pool.execute(
      `SELECT r.report_id, r.reason, r.status, r.message_snapshot, ${ts('r.created_at')}, rc.full_name AS reported_name
       FROM message_reports r LEFT JOIN clients rc ON rc.client_id = r.reported_client_id
       WHERE r.source = 'event' AND r.context_id = ? ORDER BY r.created_at DESC LIMIT 20`,
      [publicId],
    )
    response.json({
      archived: false,
      event: {
        ...listEvent(row),
        description: row.description,
        vibe: row.vibe,
        venueName: row.venue_name,
        venueAddress: row.venue_address,
        landmark: row.landmark,
        coordinates: row.latitude != null ? [Number(row.latitude), Number(row.longitude)] : null,
        requestCutoffMinutes: Number(row.join_request_cutoff_minutes),
        food: row.food_available ? row.food_preference || 'any' : null,
        beverages: Boolean(row.beverages_available),
        drinks: Boolean(row.drinks_available),
        attendeePreference: row.attendee_preference,
        experienceLevel: row.experience_level,
        preferences: jsonValue(row.preferences, []),
        tags: jsonValue(row.event_tags, []),
        bannerImage: row.banner_image,
        host: { id: Number(row.host_client_id), name: row.host_name, status: row.host_status, email: row.host_email },
      },
      people: people.map((person) => ({
        requestId: String(person.request_id),
        status: person.status,
        requestedAt: iso(person.created_at),
        reviewedAt: iso(person.reviewed_at),
        user: { id: Number(person.client_id), name: person.full_name, status: person.account_status },
      })),
      media: media.map((item) => ({
        id: String(item.media_id),
        kind: item.media_kind,
        mimeType: item.mime_type,
        name: item.original_name,
        bytes: Number(item.bytes),
        createdAt: iso(item.created_at),
      })),
      reports: reports.map((report) => ({
        id: String(report.report_id),
        reason: report.reason,
        status: report.status,
        snapshot: report.message_snapshot,
        reportedName: report.reported_name || 'Deleted user',
        createdAt: iso(report.created_at),
      })),
    })
  })

  router.get('/events/:publicId/media/:mediaId', async (request, response) => {
    const mediaId = idParam(request.params.mediaId)
    if (!mediaId) throw new HttpError(400, 'Invalid media.')
    const [rows] = await pool.execute(
      `SELECT m.mime_type, m.media_data FROM activity_media m
       JOIN activities a ON a.activity_id = m.activity_id
       WHERE a.public_id = ? AND m.media_id = ? LIMIT 1`,
      [request.params.publicId, mediaId],
    )
    if (!rows[0]) return response.status(404).end()
    response.set('Content-Type', rows[0].mime_type)
    response.set('X-Content-Type-Options', 'nosniff')
    response.send(rows[0].media_data)
  })

  router.delete('/events/:publicId/media/:mediaId', async (request, response) => {
    const mediaId = idParam(request.params.mediaId)
    if (!mediaId) throw new HttpError(400, 'Invalid media.')
    const reason = cleanReason(request.body?.reason)
    if (!reason) throw new HttpError(400, 'Give a reason (up to 500 characters).')
    await withTransaction(pool, async (db) => {
      const event = await loadActivity(db, request.params.publicId, true)
      const [result] = await db.execute(
        'DELETE FROM activity_media WHERE media_id = ? AND activity_id = ?',
        [mediaId, event.activity_id],
      )
      if (result.affectedRows !== 1) throw new HttpError(404, 'Media not found.')
      await insertNotification(db, event.host_client_id, {
        type: 'event_moderated',
        title: 'A photo or video was removed',
        message: `The Spontii team removed media from ${event.title} because it broke the community guidelines.`,
        route: `/activities/${event.public_id}`,
      })
      await writeAudit(db, request, 'event.media_deleted', {
        targetType: 'event', targetId: event.public_id, details: { title: event.title, mediaId, reason },
      })
    })
    response.status(204).end()
  })

  router.post('/events/:publicId/close', async (request, response) => {
    const reason = cleanReason(request.body?.reason)
    if (!reason) throw new HttpError(400, 'Give a reason (up to 500 characters).')
    const closed = await withTransaction(pool, async (db) => {
      const event = await loadActivity(db, request.params.publicId, true)
      if (event.status !== 'active') throw new HttpError(409, 'This event is already completed.')
      const result = await closeEventAsAdmin(db, deps, event, { reason })
      await writeAudit(db, request, 'event.closed', {
        targetType: 'event', targetId: event.public_id,
        details: { title: event.title, hostId: Number(event.host_client_id), attendees: result.attendeeIds.length, reason },
      })
      return result
    })
    afterEventsClosed(deps, [closed])
    response.json({ message: 'Event closed. The host and attendees were notified.', attendeesNotified: closed.attendeeIds.length })
  })

  /* Live chat is private to the event, so reading it needs a reason and is always audited. */
  router.get('/events/:publicId/chat', async (request, response) => {
    const reason = cleanReason(request.query.reason, 300)
    if (!reason || reason.length < 5) {
      throw new HttpError(400, 'Say why you need to read this chat (at least 5 characters). It is saved in the audit log.')
    }
    const event = await loadActivity(pool, request.params.publicId)
    const [rows] = await pool.execute(
      `SELECT m.message_id, m.message_text, ${ts('m.created_at')}, c.client_id, c.full_name
       FROM activity_chat_messages m JOIN clients c ON c.client_id = m.sender_client_id
       WHERE m.activity_id = ? ORDER BY m.message_id DESC LIMIT 200`,
      [event.activity_id],
    )
    await writeAudit(pool, request, 'event.chat_viewed', {
      targetType: 'event', targetId: event.public_id, details: { title: event.title, reason, messages: rows.length },
    })
    response.json({
      messages: rows.reverse().map((row) => ({
        id: String(row.message_id),
        text: row.message_text,
        createdAt: iso(row.created_at),
        sender: { id: Number(row.client_id), name: row.full_name },
      })),
    })
  })

  router.delete('/events/:publicId/chat/:messageId', async (request, response) => {
    const messageId = idParam(request.params.messageId)
    if (!messageId) throw new HttpError(400, 'Invalid message.')
    const reason = cleanReason(request.body?.reason)
    if (!reason) throw new HttpError(400, 'Give a reason (up to 500 characters).')
    await withTransaction(pool, async (db) => {
      const event = await loadActivity(db, request.params.publicId)
      const [messages] = await db.execute(
        'SELECT message_text, sender_client_id FROM activity_chat_messages WHERE message_id = ? AND activity_id = ? FOR UPDATE',
        [messageId, event.activity_id],
      )
      if (!messages[0]) throw new HttpError(404, 'Message not found. Chat older than 24 hours is deleted automatically.')
      await db.execute('DELETE FROM activity_chat_messages WHERE message_id = ?', [messageId])
      await writeAudit(db, request, 'event.message_deleted', {
        targetType: 'event',
        targetId: event.public_id,
        details: { messageId, senderId: Number(messages[0].sender_client_id), text: messages[0].message_text, reason },
      })
    })
    response.status(204).end()
  })
}
