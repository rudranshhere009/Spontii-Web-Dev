import { afterStatusChange, setAccountStatus, suspensionEnd, warnUser } from './actions.js'
import { writeAudit } from './audit.js'
import {
  HttpError,
  cleanReason,
  idParam,
  iso,
  likePattern,
  pageParams,
  pageResult,
  textParam,
  ts,
  withTransaction,
} from './util.js'

const STATUSES = ['open', 'reviewed', 'actioned']
const REASONS = ['harassment', 'spam', 'inappropriate', 'safety', 'other']
const ACTIONS = ['none', 'delete_message', 'warn', 'suspend', 'ban']
const MESSAGE_TABLES = { event: 'activity_chat_messages', direct: 'direct_messages' }

const REPORT_COLUMNS = `r.report_id, r.source, r.message_id, r.message_snapshot, r.reason, r.status,
  r.context_id, r.context_label, r.resolution_note, r.action_taken, ${ts('r.created_at')}, ${ts('r.reviewed_at')},
  r.reporter_client_id, reporter.full_name AS reporter_name,
  r.reported_client_id, reported.full_name AS reported_name, reported.account_status AS reported_status,
  reported.warning_count AS reported_warnings, reviewer.full_name AS reviewer_name,
  (SELECT COUNT(*) FROM message_reports o WHERE o.reported_client_id = r.reported_client_id) AS reports_against_user`

const REPORT_JOINS = `FROM message_reports r
  LEFT JOIN clients reporter ON reporter.client_id = r.reporter_client_id
  LEFT JOIN clients reported ON reported.client_id = r.reported_client_id
  LEFT JOIN admin_users reviewer ON reviewer.admin_id = r.reviewed_by_admin_id`

function report(row) {
  return {
    id: String(row.report_id),
    source: row.source,
    messageId: String(row.message_id),
    snapshot: row.message_snapshot,
    reason: row.reason,
    status: row.status,
    context: row.context_id ? { id: row.context_id, label: row.context_label } : null,
    resolutionNote: row.resolution_note,
    actionTaken: row.action_taken,
    createdAt: iso(row.created_at),
    reviewedAt: iso(row.reviewed_at),
    reviewerName: row.reviewer_name,
    reporter: { id: Number(row.reporter_client_id), name: row.reporter_name || 'Deleted user' },
    reported: {
      id: Number(row.reported_client_id),
      name: row.reported_name || 'Deleted user',
      exists: Boolean(row.reported_name),
      status: row.reported_status,
      warnings: Number(row.reported_warnings || 0),
      reportsAgainst: Number(row.reports_against_user || 0),
    },
  }
}

export function registerReportRoutes(router, deps) {
  const { pool } = deps

  router.get('/reports', async (request, response) => {
    const where = []
    const params = []
    const status = request.query.status || 'open'
    if (STATUSES.includes(status)) {
      where.push('r.status = ?')
      params.push(status)
    }
    if (REASONS.includes(request.query.reason)) {
      where.push('r.reason = ?')
      params.push(request.query.reason)
    }
    if (['event', 'direct'].includes(request.query.source)) {
      where.push('r.source = ?')
      params.push(request.query.source)
    }
    const q = textParam(request.query.q, 100)
    if (q) {
      where.push('(reported.full_name LIKE ? OR r.message_snapshot LIKE ?)')
      params.push(likePattern(q), likePattern(q))
    }
    const reportedId = idParam(request.query.reportedId)
    if (reportedId) {
      where.push('r.reported_client_id = ?')
      params.push(reportedId)
    }
    const sql = where.length ? where.join(' AND ') : '1 = 1'
    /* The open queue puts safety reports first, then oldest first; history shows newest first. */
    const order = status === 'open'
      ? "r.reason = 'safety' DESC, r.created_at ASC"
      : 'COALESCE(r.reviewed_at, r.created_at) DESC'
    const page = pageParams(request.query)
    const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total ${REPORT_JOINS} WHERE ${sql}`, params)
    const [rows] = await pool.execute(
      `SELECT ${REPORT_COLUMNS} ${REPORT_JOINS} WHERE ${sql} ORDER BY ${order} ${page.sql}`,
      params,
    )
    response.json(pageResult(rows.map(report), total, page))
  })

  router.get('/reports/summary', async (_request, response) => {
    const [byStatus] = await pool.query('SELECT status, COUNT(*) AS total FROM message_reports GROUP BY status')
    const [byReason] = await pool.query(
      "SELECT reason, COUNT(*) AS total FROM message_reports WHERE status = 'open' GROUP BY reason",
    )
    response.json({
      byStatus: Object.fromEntries(byStatus.map((row) => [row.status, Number(row.total)])),
      openByReason: Object.fromEntries(byReason.map((row) => [row.reason, Number(row.total)])),
    })
  })

  router.get('/reports/:id', async (request, response) => {
    const id = idParam(request.params.id)
    if (!id) throw new HttpError(400, 'Invalid report.')
    const [rows] = await pool.execute(`SELECT ${REPORT_COLUMNS} ${REPORT_JOINS} WHERE r.report_id = ? LIMIT 1`, [id])
    if (!rows[0]) throw new HttpError(404, 'Report not found.')
    const item = report(rows[0])

    const [messages] = await pool.execute(
      `SELECT 1 FROM ${MESSAGE_TABLES[item.source]} WHERE message_id = ? LIMIT 1`,
      [item.messageId],
    )
    let eventStatus = null
    if (item.source === 'event' && item.context) {
      const [events] = await pool.execute('SELECT status FROM activities WHERE public_id = ? LIMIT 1', [item.context.id])
      if (events[0]) {
        eventStatus = events[0].status === 'active' ? 'live' : events[0].status
      } else {
        const [archived] = await pool.execute('SELECT 1 FROM activity_archive WHERE public_id = ? LIMIT 1', [item.context.id])
        eventStatus = archived[0] ? 'archived' : 'gone'
      }
    }
    const [others] = await pool.execute(
      `SELECT ${REPORT_COLUMNS} ${REPORT_JOINS}
       WHERE r.reported_client_id = ? AND r.report_id <> ?
       ORDER BY r.created_at DESC LIMIT 10`,
      [item.reported.id, id],
    )
    const [sameMessage] = await pool.execute(
      `SELECT COUNT(*) AS total FROM message_reports
       WHERE source = ? AND message_id = ? AND report_id <> ?`,
      [item.source, item.messageId, id],
    )
    response.json({
      report: item,
      messageExists: Boolean(messages[0]),
      eventStatus,
      sameMessageReports: Number(sameMessage[0].total),
      otherReports: others.map(report),
    })
  })

  /*
   * Resolves a report and, optionally, acts on it in the same transaction.
   * Other open reports of the same message are resolved with it.
   */
  router.patch('/reports/:id', async (request, response) => {
    const id = idParam(request.params.id)
    if (!id) throw new HttpError(400, 'Invalid report.')
    const action = request.body?.action
    if (!ACTIONS.includes(action)) throw new HttpError(400, 'Choose what to do: none, delete_message, warn, suspend or ban.')
    const note = cleanReason(request.body?.note)
    if (!note) throw new HttpError(400, 'Add a resolution note (up to 500 characters).')
    const userMessage = cleanReason(request.body?.userMessage)
    if (['warn', 'suspend', 'ban'].includes(action) && !userMessage) {
      throw new HttpError(400, 'Write the message the user will see.')
    }
    const until = action === 'suspend' ? suspensionEnd(request.body?.until) : null

    const result = await withTransaction(pool, async (db) => {
      const [rows] = await db.execute(
        `SELECT report_id, source, message_id, reported_client_id, status, reason
         FROM message_reports WHERE report_id = ? FOR UPDATE`,
        [id],
      )
      const item = rows[0]
      if (!item) throw new HttpError(404, 'Report not found.')
      if (item.status !== 'open') throw new HttpError(409, 'This report has already been resolved.')
      const reportedId = Number(item.reported_client_id)

      let messageDeleted = false
      let change = null
      if (action === 'delete_message') {
        const [deleted] = await db.execute(
          `DELETE FROM ${MESSAGE_TABLES[item.source]} WHERE message_id = ?`,
          [item.message_id],
        )
        messageDeleted = deleted.affectedRows === 1
      } else if (action === 'warn') {
        await warnUser(db, request, reportedId, userMessage, 'report')
      } else if (action === 'suspend' || action === 'ban') {
        change = await setAccountStatus(db, deps, request, reportedId, {
          status: action === 'suspend' ? 'suspended' : 'banned',
          reason: userMessage,
          until,
          source: 'report',
        })
      }

      const [resolved] = await db.execute(
        `UPDATE message_reports
         SET status = ?, reviewed_by_admin_id = ?, reviewed_at = NOW(), resolution_note = ?, action_taken = ?
         WHERE status = 'open' AND (report_id = ? OR (source = ? AND message_id = ?))`,
        [action === 'none' ? 'reviewed' : 'actioned', request.admin.id, note, action, id, item.source, item.message_id],
      )
      await writeAudit(db, request, 'report.resolved', {
        targetType: 'report',
        targetId: id,
        details: {
          action,
          note,
          reason: item.reason,
          reportedId,
          messageDeleted,
          reportsResolved: resolved.affectedRows,
        },
      })
      return { change, messageDeleted, reportsResolved: resolved.affectedRows }
    })

    if (result.change) afterStatusChange(deps, result.change)
    response.json({
      message: action === 'none' ? 'Report marked as reviewed.' : 'Report resolved.',
      messageDeleted: result.messageDeleted,
      reportsResolved: result.reportsResolved,
    })
  })
}
