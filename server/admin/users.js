import {
  ACCOUNT_STATUSES,
  afterStatusChange,
  closeHostedEvents,
  insertNotification,
  lockClient,
  setAccountStatus,
  suspensionEnd,
  warnUser,
} from './actions.js'
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
  sendCsv,
  textParam,
  ts,
  withTransaction,
} from './util.js'

const SORTS = {
  newest: 'c.created_at DESC',
  oldest: 'c.created_at ASC',
  name: 'c.full_name ASC',
  points: 'c.spontii_points DESC',
  score: 'c.spontii_score DESC',
  last_seen: 'c.last_seen_at IS NULL, c.last_seen_at DESC',
  reports: 'reports_against DESC, c.created_at DESC',
}
const MODERATABLE = {
  name: "full_name = 'Spontii user'",
  city: 'profile_city = NULL',
  tagline: 'profile_tagline = NULL',
  bio: 'profile_bio = NULL',
  tags: 'profile_tags = NULL',
  photo: 'profile_photo = NULL, profile_photo_mime = NULL',
}

const LIST_COLUMNS = `c.client_id, c.full_name, c.email, c.phone_number, c.spontiii_id, c.profile_city,
  c.account_status, c.spontii_verified, c.spontii_points, c.spontii_score, c.warning_count,
  c.profile_photo_mime IS NOT NULL AS has_photo, ${ts('c.created_at')}, ${ts('c.last_seen_at')},
  (SELECT COUNT(*) FROM message_reports r WHERE r.reported_client_id = c.client_id) AS reports_against`

function listUser(row) {
  return {
    id: Number(row.client_id),
    name: row.full_name,
    email: row.email,
    phone: row.phone_number,
    spontiiiId: row.spontiii_id,
    city: row.profile_city || '',
    status: row.account_status,
    verified: Boolean(row.spontii_verified),
    points: Number(row.spontii_points),
    score: Number(row.spontii_score),
    warnings: Number(row.warning_count),
    hasPhoto: Boolean(row.has_photo),
    reportsAgainst: Number(row.reports_against || 0),
    createdAt: iso(row.created_at),
    lastSeenAt: iso(row.last_seen_at),
  }
}

function userFilters(query) {
  const where = ['1 = 1']
  const params = []
  const q = textParam(query.q, 100)
  if (q) {
    const pattern = likePattern(q)
    where.push('(c.full_name LIKE ? OR c.email LIKE ? OR c.phone_number LIKE ? OR c.spontiii_id LIKE ?)')
    params.push(pattern, pattern, pattern, pattern)
  }
  if (ACCOUNT_STATUSES.includes(query.status)) {
    where.push('c.account_status = ?')
    params.push(query.status)
  }
  const city = textParam(query.city, 80)
  if (city) {
    where.push('c.profile_city LIKE ?')
    params.push(likePattern(city))
  }
  if (query.verified === 'yes') where.push('c.spontii_verified = TRUE')
  if (query.verified === 'no') where.push('c.spontii_verified = FALSE')
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.joinedFrom || '')) {
    where.push('c.created_at >= ?')
    params.push(`${query.joinedFrom} 00:00:00`)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.joinedTo || '')) {
    where.push('c.created_at < ? + INTERVAL 1 DAY')
    params.push(`${query.joinedTo} 00:00:00`)
  }
  return { sql: where.join(' AND '), params, order: SORTS[query.sort] || SORTS.newest }
}

function userId(request) {
  const id = idParam(request.params.id)
  if (!id) throw new HttpError(400, 'Invalid user.')
  return id
}

function requiredReason(body, label = 'a reason') {
  const reason = cleanReason(body?.reason)
  if (!reason) throw new HttpError(400, `Give ${label} (up to 500 characters).`)
  return reason
}

export function registerUserRoutes(router, deps) {
  const { pool } = deps

  async function loadListUser(id) {
    const [rows] = await pool.execute(`SELECT ${LIST_COLUMNS} FROM clients c WHERE c.client_id = ?`, [id])
    return rows[0] ? listUser(rows[0]) : null
  }

  router.get('/search', async (request, response) => {
    const q = textParam(request.query.q, 100)
    if (q.length < 2) return response.json({ users: [], events: [] })
    const pattern = likePattern(q)
    const [users] = await pool.execute(
      `SELECT c.client_id, c.full_name, c.email, c.spontiii_id, c.account_status
       FROM clients c
       WHERE c.full_name LIKE ? OR c.email LIKE ? OR c.phone_number LIKE ? OR c.spontiii_id LIKE ?
       ORDER BY c.full_name LIMIT 6`,
      [pattern, pattern, pattern, pattern],
    )
    const [events] = await pool.execute(
      `SELECT * FROM (
         (SELECT a.public_id, a.title, a.city, IF(a.status = 'active', 'live', a.status) AS status,
                 c.full_name AS host_name, a.starts_at
          FROM activities a JOIN clients c ON c.client_id = a.host_client_id
          WHERE a.title LIKE ? OR a.public_id = ? LIMIT 5)
         UNION ALL
         (SELECT public_id, title, city, 'archived', host_name, starts_at
          FROM activity_archive WHERE title LIKE ? OR public_id = ? LIMIT 3)
       ) found ORDER BY starts_at DESC`,
      [pattern, q, pattern, q],
    )
    response.json({
      users: users.map((row) => ({
        id: Number(row.client_id),
        name: row.full_name,
        email: row.email,
        spontiiiId: row.spontiii_id,
        status: row.account_status,
      })),
      events: events.map((row) => ({
        id: row.public_id,
        title: row.title,
        city: row.city,
        status: row.status,
        hostName: row.host_name,
      })),
    })
  })

  router.get('/users', async (request, response) => {
    const filters = userFilters(request.query)
    const page = pageParams(request.query)
    const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM clients c WHERE ${filters.sql}`, filters.params)
    const [rows] = await pool.execute(
      `SELECT ${LIST_COLUMNS} FROM clients c WHERE ${filters.sql} ORDER BY ${filters.order} ${page.sql}`,
      filters.params,
    )
    response.json(pageResult(rows.map(listUser), total, page))
  })

  router.get('/users/export.csv', async (request, response) => {
    const filters = userFilters(request.query)
    const [rows] = await pool.execute(
      `SELECT ${LIST_COLUMNS} FROM clients c WHERE ${filters.sql} ORDER BY ${filters.order} LIMIT 10000`,
      filters.params,
    )
    await writeAudit(pool, request, 'users.exported', { details: { filters: request.query, rows: rows.length } })
    sendCsv(response, `spontii-users-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['id', 'ID'], ['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['spontiiiId', 'Spontiii ID'],
      ['city', 'City'], ['status', 'Status'], ['verified', 'Verified'], ['points', 'Points'], ['score', 'Score'],
      ['warnings', 'Warnings'], ['reportsAgainst', 'Reports against'], ['createdAt', 'Joined'], ['lastSeenAt', 'Last seen'],
    ], rows.map(listUser))
  })

  router.get('/users/:id', async (request, response) => {
    const id = userId(request)
    const [rows] = await pool.execute(
      `SELECT ${LIST_COLUMNS}, c.profile_tagline, c.profile_bio, c.profile_tags, c.status_reason,
              c.lifetime_activities_created, c.session_version,
              ${ts('c.suspended_until')},
              DATE_FORMAT(c.last_daily_points_claim_date, '%Y-%m-%d') AS last_daily_claim,
              (SELECT COUNT(*) FROM friendships f
               WHERE (f.client_low_id = c.client_id OR f.client_high_id = c.client_id) AND f.status = 'accepted') AS friends,
              (SELECT COUNT(*) FROM friendships f WHERE f.recipient_client_id = c.client_id AND f.status = 'pending') AS incoming_requests,
              (SELECT COUNT(*) FROM user_blocks b WHERE b.blocker_client_id = c.client_id) AS blocks_given,
              (SELECT COUNT(*) FROM user_blocks b WHERE b.blocked_client_id = c.client_id) AS blocks_received,
              (SELECT COUNT(*) FROM message_reports r WHERE r.reported_client_id = c.client_id AND r.status = 'open') AS open_reports_against,
              (SELECT COUNT(*) FROM message_reports r WHERE r.reporter_client_id = c.client_id) AS reports_filed,
              (SELECT COUNT(*) FROM activity_join_requests jr
               JOIN activities a ON a.activity_id = jr.activity_id
               WHERE jr.applicant_client_id = c.client_id AND jr.status = 'approved') AS events_joined,
              (SELECT COUNT(*) FROM client_login_history h WHERE h.client_id = c.client_id) AS logins
       FROM clients c WHERE c.client_id = ? LIMIT 1`,
      [id],
    )
    const row = rows[0]
    if (!row) throw new HttpError(404, 'User not found.')

    const [hosted] = await pool.execute(
      `SELECT public_id, title, status, visibility, starts_at, ends_at, completed_by
       FROM activities WHERE host_client_id = ? ORDER BY starts_at DESC LIMIT 20`,
      [id],
    )
    const [archived] = await pool.execute(
      `SELECT public_id, title, starts_at, ends_at, completed_by, approved_count
       FROM activity_archive WHERE host_client_id = ? ORDER BY ends_at DESC LIMIT 20`,
      [id],
    )
    const [reports] = await pool.execute(
      `SELECT r.report_id, r.source, r.reason, r.status, r.message_snapshot, ${ts('r.created_at')},
              rc.full_name AS reporter_name
       FROM message_reports r LEFT JOIN clients rc ON rc.client_id = r.reporter_client_id
       WHERE r.reported_client_id = ? ORDER BY r.created_at DESC LIMIT 10`,
      [id],
    )
    const tags = jsonValue(row.profile_tags, [])
    response.json({
      user: {
        ...listUser(row),
        tagline: row.profile_tagline || '',
        bio: row.profile_bio || '',
        tags: Array.isArray(tags) ? tags : [],
        statusReason: row.status_reason,
        suspendedUntil: iso(row.suspended_until),
        activitiesCreated: Number(row.lifetime_activities_created),
        lastDailyClaim: row.last_daily_claim,
        counts: {
          friends: Number(row.friends),
          incomingRequests: Number(row.incoming_requests),
          blocksGiven: Number(row.blocks_given),
          blocksReceived: Number(row.blocks_received),
          reportsAgainst: Number(row.reports_against),
          openReportsAgainst: Number(row.open_reports_against),
          reportsFiled: Number(row.reports_filed),
          eventsJoined: Number(row.events_joined),
          eventsHostedArchived: archived.length,
          logins: Number(row.logins),
        },
      },
      hostedEvents: hosted.map((event) => ({
        id: event.public_id,
        title: event.title,
        status: event.status === 'active' ? 'live' : event.status,
        visibility: event.visibility,
        startsAt: new Date(event.starts_at).toISOString(),
        endsAt: new Date(event.ends_at).toISOString(),
        completedBy: event.completed_by,
      })),
      archivedEvents: archived.map((event) => ({
        id: event.public_id,
        title: event.title,
        startsAt: new Date(event.starts_at).toISOString(),
        endsAt: new Date(event.ends_at).toISOString(),
        completedBy: event.completed_by,
        attendees: Number(event.approved_count),
      })),
      reportsAgainst: reports.map((report) => ({
        id: String(report.report_id),
        source: report.source,
        reason: report.reason,
        status: report.status,
        snapshot: report.message_snapshot,
        reporterName: report.reporter_name || 'Deleted user',
        createdAt: iso(report.created_at),
      })),
    })
  })

  router.get('/users/:id/photo', async (request, response) => {
    const [rows] = await pool.execute(
      'SELECT profile_photo, profile_photo_mime FROM clients WHERE client_id = ? LIMIT 1',
      [userId(request)],
    )
    if (!rows[0]?.profile_photo) return response.status(404).end()
    response.set('Content-Type', rows[0].profile_photo_mime)
    response.set('X-Content-Type-Options', 'nosniff')
    response.send(rows[0].profile_photo)
  })

  router.patch('/users/:id/status', async (request, response) => {
    const id = userId(request)
    const status = request.body?.status
    if (!ACCOUNT_STATUSES.includes(status)) throw new HttpError(400, 'Choose active, suspended or banned.')
    const reason = status === 'active' ? cleanReason(request.body?.reason) : requiredReason(request.body)
    const until = status === 'suspended' ? suspensionEnd(request.body?.until) : null

    const change = await withTransaction(pool, (db) =>
      setAccountStatus(db, deps, request, id, { status, reason, until }))
    afterStatusChange(deps, change)
    response.json({ user: await loadListUser(id), closedEvents: change.closedEvents.length })
  })

  router.post('/users/:id/warn', async (request, response) => {
    const id = userId(request)
    const reason = requiredReason(request.body, 'the warning shown to the user')
    await withTransaction(pool, (db) => warnUser(db, request, id, reason))
    response.json({ user: await loadListUser(id) })
  })

  router.post('/users/:id/force-logout', async (request, response) => {
    const id = userId(request)
    await withTransaction(pool, async (db) => {
      const client = await lockClient(db, id)
      await db.execute('UPDATE clients SET session_version = session_version + 1 WHERE client_id = ?', [id])
      await writeAudit(db, request, 'user.signed_out', { targetType: 'user', targetId: id, details: { name: client.full_name } })
    })
    deps.disconnectUser(id, 'SESSION_REVOKED')
    response.json({ message: 'The user was signed out on every device.' })
  })

  router.post('/users/:id/points', async (request, response) => {
    const id = userId(request)
    const delta = Number(request.body?.delta)
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100000) {
      throw new HttpError(400, 'Enter a whole number of points between -100000 and 100000, not 0.')
    }
    const reason = requiredReason(request.body)
    const result = await withTransaction(pool, async (db) => {
      const client = await lockClient(db, id)
      const before = Number(client.spontii_points)
      await db.execute(
        'UPDATE clients SET spontii_points = GREATEST(0, CAST(spontii_points AS SIGNED) + ?) WHERE client_id = ?',
        [delta, id],
      )
      const [[{ spontii_points: after }]] = await db.execute('SELECT spontii_points FROM clients WHERE client_id = ?', [id])
      const applied = Number(after) - before
      await db.execute(
        `INSERT INTO points_ledger (client_id, delta, balance_after, source, admin_id, reason)
         VALUES (?, ?, ?, 'admin_adjust', ?, ?)`,
        [id, applied, Number(after), request.admin.id, reason.slice(0, 255)],
      )
      if (applied !== 0) {
        await insertNotification(db, id, {
          type: 'points_adjusted',
          title: applied > 0 ? `+${applied} Spontii points` : 'Spontii points adjusted',
          message: `The Spontii team ${applied > 0 ? 'added' : 'removed'} ${Math.abs(applied)} points. Your balance is now ${after}.`,
        })
      }
      await writeAudit(db, request, 'user.points_adjusted', {
        targetType: 'user', targetId: id, details: { name: client.full_name, requested: delta, applied, before, after: Number(after), reason },
      })
      return { applied, balance: Number(after) }
    })
    response.json(result)
  })

  router.get('/users/:id/points-ledger', async (request, response) => {
    const id = userId(request)
    const page = pageParams(request.query, { defaultSize: 20 })
    const [[{ total }]] = await pool.execute('SELECT COUNT(*) AS total FROM points_ledger WHERE client_id = ?', [id])
    const [rows] = await pool.execute(
      `SELECT l.entry_id, l.delta, l.balance_after, l.source, l.reason, ${ts('l.created_at')}, a.full_name AS admin_name
       FROM points_ledger l LEFT JOIN admin_users a ON a.admin_id = l.admin_id
       WHERE l.client_id = ? ORDER BY l.entry_id DESC ${page.sql}`,
      [id],
    )
    response.json(pageResult(rows.map((row) => ({
      id: String(row.entry_id),
      delta: Number(row.delta),
      balanceAfter: Number(row.balance_after),
      source: row.source,
      reason: row.reason,
      adminName: row.admin_name,
      createdAt: iso(row.created_at),
    })), total, page))
  })

  router.patch('/users/:id/moderate-profile', async (request, response) => {
    const id = userId(request)
    const fields = Array.isArray(request.body?.fields)
      ? [...new Set(request.body.fields)].filter((field) => Object.hasOwn(MODERATABLE, field))
      : []
    if (!fields.length) throw new HttpError(400, 'Choose what to remove from the profile.')
    const reason = requiredReason(request.body)
    await withTransaction(pool, async (db) => {
      const [rows] = await db.execute(
        `SELECT full_name, profile_city, profile_tagline, profile_bio, profile_tags
         FROM clients WHERE client_id = ? FOR UPDATE`,
        [id],
      )
      if (!rows[0]) throw new HttpError(404, 'User not found.')
      const previous = rows[0]
      await db.execute(
        `UPDATE clients SET ${fields.map((field) => MODERATABLE[field]).join(', ')} WHERE client_id = ?`,
        [id],
      )
      const [updated] = await db.execute(
        `SELECT profile_city, profile_tagline, profile_bio, profile_tags, profile_photo_mime
         FROM clients WHERE client_id = ?`,
        [id],
      )
      await db.execute('UPDATE clients SET spontii_score = ? WHERE client_id = ?', [
        deps.profileScore(deps.calculateProfileCompletion(updated[0])),
        id,
      ])
      await insertNotification(db, id, {
        type: 'profile_moderated',
        title: 'Part of your profile was removed',
        message: 'Something on your profile broke the Spontii community guidelines, so the team removed it. You can update your profile any time.',
        route: '/profile',
      })
      await writeAudit(db, request, 'user.profile_moderated', {
        targetType: 'user',
        targetId: id,
        details: {
          fields,
          reason,
          removed: {
            ...(fields.includes('name') && { name: previous.full_name }),
            ...(fields.includes('city') && { city: previous.profile_city }),
            ...(fields.includes('tagline') && { tagline: previous.profile_tagline }),
            ...(fields.includes('bio') && { bio: previous.profile_bio }),
            ...(fields.includes('tags') && { tags: jsonValue(previous.profile_tags, []) }),
          },
        },
      })
    })
    response.json({ user: await loadListUser(id) })
  })

  router.patch('/users/:id/verified', async (request, response) => {
    const id = userId(request)
    if (typeof request.body?.verified !== 'boolean') throw new HttpError(400, 'Send verified: true or false.')
    const verified = request.body.verified
    await withTransaction(pool, async (db) => {
      const client = await lockClient(db, id)
      if (Boolean(client.spontii_verified) === verified) return
      await db.execute('UPDATE clients SET spontii_verified = ? WHERE client_id = ?', [verified, id])
      if (verified) {
        await insertNotification(db, id, {
          type: 'spontii_verified',
          title: "You're Spontii Verified",
          message: 'The Spontii team verified your profile. A badge now shows next to your name.',
          route: '/profile',
          dedupeKey: 'spontii-verified',
        })
      }
      await writeAudit(db, request, verified ? 'user.verified' : 'user.unverified', {
        targetType: 'user', targetId: id, details: { name: client.full_name, reason: cleanReason(request.body?.reason) },
      })
    })
    response.json({ user: await loadListUser(id) })
  })

  router.get('/users/:id/notes', async (request, response) => {
    const [rows] = await pool.execute(
      `SELECT n.note_id, n.note, ${ts('n.created_at')}, a.full_name AS admin_name
       FROM admin_user_notes n LEFT JOIN admin_users a ON a.admin_id = n.admin_id
       WHERE n.client_id = ? ORDER BY n.note_id DESC LIMIT 100`,
      [userId(request)],
    )
    response.json({
      notes: rows.map((row) => ({
        id: String(row.note_id),
        note: row.note,
        adminName: row.admin_name,
        createdAt: iso(row.created_at),
      })),
    })
  })

  router.post('/users/:id/notes', async (request, response) => {
    const id = userId(request)
    const note = cleanReason(request.body?.note, 2000)
    if (!note) throw new HttpError(400, 'Write a note (up to 2000 characters).')
    await withTransaction(pool, async (db) => {
      await lockClient(db, id)
      await db.execute('INSERT INTO admin_user_notes (client_id, admin_id, note) VALUES (?, ?, ?)', [id, request.admin.id, note])
      await writeAudit(db, request, 'user.note_added', { targetType: 'user', targetId: id })
    })
    response.status(201).json({ message: 'Note saved.' })
  })

  router.get('/users/:id/login-history', async (request, response) => {
    const [rows] = await pool.execute(
      `SELECT login_id, method, ip, user_agent, ${ts('created_at')}
       FROM client_login_history WHERE client_id = ? ORDER BY login_id DESC LIMIT 50`,
      [userId(request)],
    )
    response.json({
      logins: rows.map((row) => ({
        id: String(row.login_id),
        method: row.method,
        ip: row.ip,
        userAgent: row.user_agent,
        createdAt: iso(row.created_at),
      })),
    })
  })

  /* Account data for a data-access request. Message text is left out on purpose. */
  router.get('/users/:id/export', async (request, response) => {
    const id = userId(request)
    const [profiles] = await pool.execute(
      `SELECT client_id, full_name, email, phone_number, spontiii_id, profile_city, profile_tagline,
              profile_bio, profile_tags, account_status, spontii_points, spontii_score, spontii_verified,
              lifetime_activities_created, ${ts('created_at')}, ${ts('last_seen_at')}
       FROM clients WHERE client_id = ?`,
      [id],
    )
    if (!profiles[0]) throw new HttpError(404, 'User not found.')
    const [friends] = await pool.execute(
      `SELECT c.client_id, c.full_name, f.status, ${ts('f.created_at')}
       FROM friendships f
       JOIN clients c ON c.client_id = IF(f.client_low_id = ?, f.client_high_id, f.client_low_id)
       WHERE f.client_low_id = ? OR f.client_high_id = ?`,
      [id, id, id],
    )
    const [hosted] = await pool.execute(
      'SELECT public_id, title, city, starts_at, ends_at, status FROM activities WHERE host_client_id = ?',
      [id],
    )
    const [archived] = await pool.execute(
      'SELECT public_id, title, city, starts_at, ends_at, completed_by FROM activity_archive WHERE host_client_id = ?',
      [id],
    )
    const [joined] = await pool.execute(
      `SELECT a.public_id, a.title, jr.status, ${ts('jr.created_at')}
       FROM activity_join_requests jr JOIN activities a ON a.activity_id = jr.activity_id
       WHERE jr.applicant_client_id = ?`,
      [id],
    )
    const [ledger] = await pool.execute(
      `SELECT delta, balance_after, source, reason, ${ts('created_at')} FROM points_ledger WHERE client_id = ? ORDER BY entry_id`,
      [id],
    )
    const [logins] = await pool.execute(
      `SELECT method, ip, user_agent, ${ts('created_at')} FROM client_login_history WHERE client_id = ? ORDER BY login_id`,
      [id],
    )
    const [blocks] = await pool.execute(
      `SELECT blocked_client_id, ${ts('created_at')} FROM user_blocks WHERE blocker_client_id = ?`,
      [id],
    )
    await writeAudit(pool, request, 'user.data_exported', { targetType: 'user', targetId: id })
    const profile = profiles[0]
    const stamp = (rows) => rows.map((row) => ({ ...row, created_at: iso(row.created_at) }))
    response.set('Content-Disposition', `attachment; filename="spontii-user-${id}.json"`)
    response.json({
      exportedAt: new Date().toISOString(),
      profile: {
        ...profile,
        profile_tags: jsonValue(profile.profile_tags, []),
        created_at: iso(profile.created_at),
        last_seen_at: iso(profile.last_seen_at),
      },
      friendships: stamp(friends),
      hostedEvents: [...hosted, ...archived],
      joinRequests: stamp(joined),
      pointsLedger: stamp(ledger),
      loginHistory: stamp(logins),
      blockedUsers: stamp(blocks),
    })
  })

  router.delete('/users/:id', async (request, response) => {
    const id = userId(request)
    const confirmEmail = typeof request.body?.confirmEmail === 'string' ? request.body.confirmEmail.trim().toLowerCase() : ''
    const reason = requiredReason(request.body)
    const blockIdentity = request.body?.blockIdentity === true
    const closed = await withTransaction(pool, async (db) => {
      const client = await lockClient(db, id)
      if (confirmEmail !== client.email.toLowerCase()) {
        throw new HttpError(400, "Type the user's email exactly to confirm.")
      }
      const closedEvents = await closeHostedEvents(db, deps, id)
      await db.execute(
        "UPDATE activity_archive SET host_client_id = NULL, host_name = 'Deleted user' WHERE host_client_id = ?",
        [id],
      )
      await db.execute('DELETE FROM email_verifications WHERE email = ?', [client.email])
      await db.execute('DELETE FROM login_otps WHERE email = ?', [client.email])
      if (blockIdentity) {
        for (const [kind, value] of [['email', client.email], ['phone', client.phone_number]]) {
          await db.execute(
            `INSERT IGNORE INTO blocked_identities (kind, identity_value, reason, admin_id) VALUES (?, ?, ?, ?)`,
            [kind, value, reason.slice(0, 255), request.admin.id],
          )
        }
      }
      /* Cascades to the user's events, requests, chat, friendships, blocks, notifications and DMs. */
      await db.execute('DELETE FROM clients WHERE client_id = ?', [id])
      await writeAudit(db, request, 'user.deleted', {
        targetType: 'user',
        targetId: id,
        details: {
          name: client.full_name,
          email: client.email,
          phone: client.phone_number,
          spontiiiId: client.spontiii_id,
          reason,
          blockedIdentity: blockIdentity,
          closedEvents: closedEvents.map((event) => event.publicId),
        },
      })
      return closedEvents
    })
    deps.disconnectUser(id, 'SESSION_REVOKED')
    /* The events are gone with the user, so tell attendees directly that the chats closed. */
    for (const event of closed) {
      deps.emitToUsers(event.attendeeIds, 'thread:access', {
        kind: 'event', threadId: event.publicId, canSend: false, reason: 'ended',
      })
    }
    response.json({ message: 'The account and its data were deleted.' })
  })
}
