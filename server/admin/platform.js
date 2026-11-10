import { writeAudit } from './audit.js'
import { allSettings, applySettings, saveSettings, validateSettingChanges } from './settings.js'
import {
  HttpError,
  cleanReason,
  idParam,
  iso,
  jsonValue,
  pageParams,
  pageResult,
  textParam,
  ts,
  withTransaction,
} from './util.js'

const AUDIENCES = ['all', 'city', 'users', 'hosts']

/* Returns the SQL condition (on clients c) and params for an announcement audience. */
function audienceFilter(audience) {
  if (!audience || !AUDIENCES.includes(audience.type)) {
    throw new HttpError(400, 'Choose who receives it: all, city, users or hosts.')
  }
  if (audience.type === 'all') return { sql: '1 = 1', params: [], stored: { type: 'all' } }
  if (audience.type === 'hosts') {
    return {
      sql: `EXISTS (SELECT 1 FROM activities a WHERE a.host_client_id = c.client_id
                    AND a.status = 'active' AND a.ends_at > UTC_TIMESTAMP())`,
      params: [],
      stored: { type: 'hosts' },
    }
  }
  if (audience.type === 'city') {
    const city = textParam(audience.value, 80)
    if (!city) throw new HttpError(400, 'Enter the city.')
    return { sql: 'c.profile_city = ?', params: [city], stored: { type: 'city', value: city } }
  }
  const ids = Array.isArray(audience.value)
    ? [...new Set(audience.value.map((value) => idParam(String(value))).filter(Boolean))]
    : []
  if (!ids.length || ids.length > 1000) throw new HttpError(400, 'List between 1 and 1000 user IDs.')
  return { sql: `c.client_id IN (${ids.map(() => '?').join(', ')})`, params: ids, stored: { type: 'users', value: ids } }
}

/* Announcements may only link inside the app, never to another site. */
function internalRoute(value) {
  const route = typeof value === 'string' ? value.trim() : ''
  if (!route) return null
  if (!/^\/(?!\/)[\w\-./?=&%#]*$/.test(route) || route.length > 255) {
    throw new HttpError(400, 'The link must be a path inside Spontii, like /explore.')
  }
  return route
}

export function registerPlatformRoutes(router, deps) {
  const { pool } = deps

  router.get('/settings', async (_request, response) => {
    const [rows] = await pool.query(
      `SELECT s.setting_key, ${ts('s.updated_at')}, a.full_name AS admin_name
       FROM app_settings s LEFT JOIN admin_users a ON a.admin_id = s.updated_by`,
    )
    response.json({
      settings: allSettings(),
      changes: Object.fromEntries(rows.map((row) => [row.setting_key, { at: iso(row.updated_at), by: row.admin_name }])),
    })
  })

  router.patch('/settings', async (request, response) => {
    const { values, message } = validateSettingChanges(request.body?.settings)
    if (message) throw new HttpError(400, message)
    const previous = allSettings()
    await withTransaction(pool, async (db) => {
      await saveSettings(db, values, request.admin.id)
      await writeAudit(db, request, 'settings.updated', {
        targetType: 'settings',
        details: {
          changed: Object.keys(values).join(', '),
          before: Object.fromEntries(Object.keys(values).map((key) => [key, previous[key]])),
          after: values,
        },
      })
    })
    applySettings(values)
    response.json({ settings: allSettings() })
  })

  router.get('/blocklist', async (request, response) => {
    const page = pageParams(request.query, { defaultSize: 50 })
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM blocked_identities')
    const [rows] = await pool.query(
      `SELECT b.blocked_id, b.kind, b.identity_value, b.reason, ${ts('b.created_at')}, a.full_name AS admin_name
       FROM blocked_identities b LEFT JOIN admin_users a ON a.admin_id = b.admin_id
       ORDER BY b.blocked_id DESC ${page.sql}`,
    )
    response.json(pageResult(rows.map((row) => ({
      id: String(row.blocked_id),
      kind: row.kind,
      value: row.identity_value,
      reason: row.reason,
      adminName: row.admin_name,
      createdAt: iso(row.created_at),
    })), total, page))
  })

  router.post('/blocklist', async (request, response) => {
    const kind = request.body?.kind
    const raw = typeof request.body?.value === 'string' ? request.body.value.trim() : ''
    let value
    if (kind === 'email') {
      value = raw.toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254) throw new HttpError(400, 'Enter a valid email address.')
    } else if (kind === 'phone') {
      const digits = raw.replace(/\D/g, '')
      if (digits.length < 7 || digits.length > 15) throw new HttpError(400, 'Enter a valid phone number with country code.')
      /* Stored the way signup stores phones: + and digits. */
      value = raw.startsWith('+') ? `+${digits}` : digits
    } else {
      throw new HttpError(400, 'Choose email or phone.')
    }
    const reason = cleanReason(request.body?.reason, 255)
    await withTransaction(pool, async (db) => {
      const [result] = await db.execute(
        'INSERT IGNORE INTO blocked_identities (kind, identity_value, reason, admin_id) VALUES (?, ?, ?, ?)',
        [kind, value, reason, request.admin.id],
      )
      if (result.affectedRows !== 1) throw new HttpError(409, 'That is already blocked.')
      await writeAudit(db, request, 'blocklist.added', { targetType: 'blocklist', targetId: result.insertId, details: { kind, value, reason } })
    })
    response.status(201).json({ message: 'Blocked from signing up.' })
  })

  router.delete('/blocklist/:id', async (request, response) => {
    const id = idParam(request.params.id)
    if (!id) throw new HttpError(400, 'Invalid entry.')
    await withTransaction(pool, async (db) => {
      const [rows] = await db.execute('SELECT kind, identity_value FROM blocked_identities WHERE blocked_id = ? FOR UPDATE', [id])
      if (!rows[0]) throw new HttpError(404, 'Entry not found.')
      await db.execute('DELETE FROM blocked_identities WHERE blocked_id = ?', [id])
      await writeAudit(db, request, 'blocklist.removed', {
        targetType: 'blocklist', targetId: id, details: { kind: rows[0].kind, value: rows[0].identity_value },
      })
    })
    response.status(204).end()
  })

  router.post('/announcements/preview', async (request, response) => {
    const audience = audienceFilter(request.body?.audience)
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM clients c WHERE c.account_status = 'active' AND ${audience.sql}`,
      audience.params,
    )
    response.json({ recipients: Number(total) })
  })

  router.post('/announcements', async (request, response) => {
    const title = cleanReason(request.body?.title, 120)
    const message = cleanReason(request.body?.message, 500)
    if (!title || !message) throw new HttpError(400, 'Write a title (up to 120 characters) and a message (up to 500).')
    const route = internalRoute(request.body?.route)
    const audience = audienceFilter(request.body?.audience)

    const result = await withTransaction(pool, async (db) => {
      const [created] = await db.execute(
        'INSERT INTO admin_announcements (title, message, route, audience, sent_by) VALUES (?, ?, ?, ?, ?)',
        [title, message, route, JSON.stringify(audience.stored), request.admin.id],
      )
      /* The dedupe key makes a retried send a no-op for people who already have it. */
      const [sent] = await db.execute(
        `INSERT IGNORE INTO notifications (client_id, type, title, message, route, dedupe_key)
         SELECT c.client_id, 'system_announcement', ?, ?, ?, ?
         FROM clients c WHERE c.account_status = 'active' AND ${audience.sql}`,
        [title, message, route, `announcement:${created.insertId}`, ...audience.params],
      )
      await db.execute('UPDATE admin_announcements SET recipients_count = ? WHERE announcement_id = ?', [sent.affectedRows, created.insertId])
      await writeAudit(db, request, 'announcement.sent', {
        targetType: 'announcement',
        targetId: created.insertId,
        details: { title, audience: audience.stored.type, recipients: sent.affectedRows },
      })
      return { id: String(created.insertId), recipients: sent.affectedRows }
    })
    response.status(201).json(result)
  })

  router.get('/announcements', async (request, response) => {
    const page = pageParams(request.query, { defaultSize: 20 })
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM admin_announcements')
    const [rows] = await pool.query(
      `SELECT n.announcement_id, n.title, n.message, n.route, n.audience, n.recipients_count,
              ${ts('n.created_at')}, a.full_name AS admin_name,
              (SELECT COUNT(*) FROM notifications x
               WHERE x.dedupe_key = CONCAT('announcement:', n.announcement_id) AND x.read_at IS NOT NULL) AS opened
       FROM admin_announcements n LEFT JOIN admin_users a ON a.admin_id = n.sent_by
       ORDER BY n.announcement_id DESC ${page.sql}`,
    )
    response.json(pageResult(rows.map((row) => ({
      id: String(row.announcement_id),
      title: row.title,
      message: row.message,
      route: row.route,
      audience: jsonValue(row.audience, {}),
      recipients: Number(row.recipients_count),
      opened: Number(row.opened),
      adminName: row.admin_name,
      createdAt: iso(row.created_at),
    })), total, page))
  })
}
