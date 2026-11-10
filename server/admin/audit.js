import { idParam, iso, jsonValue, pageParams, pageResult, sendCsv, textParam, ts } from './util.js'

/*
 * Every admin change is recorded in the same transaction as the change, so
 * the trail can't miss an action that happened (or record one that didn't).
 */
export async function writeAudit(db, request, action, { targetType = null, targetId = null, details = null } = {}) {
  await db.execute(
    `INSERT INTO admin_audit_log
       (admin_id, action, target_type, target_id, details, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      request.admin?.id ?? null,
      action,
      targetType,
      targetId == null ? null : String(targetId),
      details == null ? null : JSON.stringify(details),
      request.ip ?? null,
      request.get?.('user-agent')?.slice(0, 255) ?? null,
    ],
  )
}

export const AUDIT_COLUMNS = `l.audit_id, l.admin_id, l.action, l.target_type, l.target_id,
  l.details, l.ip, ${ts('l.created_at')}, a.full_name AS admin_name, a.email AS admin_email`

function auditFilters(query) {
  const where = ['1 = 1']
  const params = []
  const adminId = idParam(query.adminId)
  if (adminId) {
    where.push('l.admin_id = ?')
    params.push(adminId)
  }
  const action = textParam(query.action, 60)
  if (action) {
    /* "user." matches every user action; a full name matches one action. */
    where.push(action.endsWith('.') ? 'l.action LIKE ?' : 'l.action = ?')
    params.push(action.endsWith('.') ? `${action}%` : action)
  }
  const targetType = textParam(query.targetType, 30)
  if (targetType) {
    where.push('l.target_type = ?')
    params.push(targetType)
  }
  const targetId = textParam(query.targetId, 64)
  if (targetId) {
    where.push('l.target_id = ?')
    params.push(targetId)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.from || '')) {
    where.push('l.created_at >= ?')
    params.push(`${query.from} 00:00:00`)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(query.to || '')) {
    where.push('l.created_at < ? + INTERVAL 1 DAY')
    params.push(`${query.to} 00:00:00`)
  }
  return { sql: where.join(' AND '), params }
}

export function registerAuditRoutes(router, { pool }) {
  router.get('/audit', async (request, response) => {
    const filters = auditFilters(request.query)
    const page = pageParams(request.query, { defaultSize: 50 })
    const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM admin_audit_log l WHERE ${filters.sql}`, filters.params)
    const [rows] = await pool.execute(
      `SELECT ${AUDIT_COLUMNS} FROM admin_audit_log l LEFT JOIN admin_users a ON a.admin_id = l.admin_id
       WHERE ${filters.sql} ORDER BY l.audit_id DESC ${page.sql}`,
      filters.params,
    )
    response.json(pageResult(rows.map(auditEntry), total, page))
  })

  router.get('/audit/actions', async (_request, response) => {
    const [rows] = await pool.query('SELECT DISTINCT action FROM admin_audit_log ORDER BY action')
    response.json({ actions: rows.map((row) => row.action) })
  })

  router.get('/audit/export.csv', async (request, response) => {
    const filters = auditFilters(request.query)
    const [rows] = await pool.execute(
      `SELECT ${AUDIT_COLUMNS} FROM admin_audit_log l LEFT JOIN admin_users a ON a.admin_id = l.admin_id
       WHERE ${filters.sql} ORDER BY l.audit_id DESC LIMIT 20000`,
      filters.params,
    )
    await writeAudit(pool, request, 'audit.exported', { details: { filters: request.query, rows: rows.length } })
    sendCsv(response, `spontii-audit-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['createdAt', 'Time'], ['adminEmail', 'Admin'], ['action', 'Action'], ['targetType', 'Target type'],
      ['targetId', 'Target'], ['details', 'Details'], ['ip', 'IP'],
    ], rows.map((row) => {
      const entry = auditEntry(row)
      return { ...entry, adminEmail: entry.admin?.email ?? 'system', details: entry.details ? JSON.stringify(entry.details) : '' }
    }))
  })
}

export function auditEntry(row) {
  return {
    id: String(row.audit_id),
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: jsonValue(row.details, null),
    ip: row.ip,
    createdAt: iso(row.created_at),
    admin: row.admin_id
      ? { id: Number(row.admin_id), name: row.admin_name, email: row.admin_email }
      : null,
  }
}
