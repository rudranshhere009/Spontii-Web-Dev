/*
 * Small helpers shared by the admin routes.
 *
 * Time columns written with NOW() come back from mysql2 (timezone 'Z') shifted
 * by the database's offset, so admin queries select UNIX_TIMESTAMP(column) and
 * convert here, the same way chat.js does for messages.
 */

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

export function iso(unixSeconds) {
  return unixSeconds == null ? null : new Date(Number(unixSeconds) * 1000).toISOString()
}

/* `ts('c.created_at')` → "UNIX_TIMESTAMP(c.created_at) AS created_at" */
export function ts(column, alias = column.split('.').pop()) {
  return `UNIX_TIMESTAMP(${column}) AS ${alias}`
}

export function idParam(value) {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function isUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

/* LIMIT/OFFSET are validated integers inlined into the SQL (mysql2 prepared LIMIT is unreliable). */
export function pageParams(query, { defaultSize = 25, maxSize = 100 } = {}) {
  const page = Math.min(Math.max(Number.parseInt(query.page, 10) || 1, 1), 100000)
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || defaultSize, 1), maxSize)
  const offset = (page - 1) * pageSize
  return { page, pageSize, sql: `LIMIT ${pageSize} OFFSET ${offset}` }
}

export function pageResult(items, total, { page, pageSize }) {
  return { items, page, pageSize, total: Number(total), totalPages: Math.max(Math.ceil(Number(total) / pageSize), 1) }
}

export function likePattern(text) {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`
}

export function textParam(value, maxLength = 100) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function cleanReason(value, maxLength = 500) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text && text.length <= maxLength ? text : null
}

export function jsonValue(value, fallback = null) {
  if (value == null) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export async function withTransaction(pool, work) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback().catch(() => {})
    throw error
  } finally {
    connection.release()
  }
}

function csvCell(value) {
  if (value == null) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  /* Leading =, +, - or @ would run as a formula when the file is opened in a spreadsheet. */
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function sendCsv(response, filename, columns, rows) {
  const lines = [
    columns.map(([, label]) => csvCell(label)).join(','),
    ...rows.map((row) => columns.map(([key]) => csvCell(row[key])).join(',')),
  ]
  response.set('Content-Type', 'text/csv; charset=utf-8')
  response.set('Content-Disposition', `attachment; filename="${filename}"`)
  response.send(`${lines.join('\n')}\n`)
}
