import bcrypt from 'bcryptjs'
import { writeAudit } from './audit.js'
import { publicAdmin } from './auth.js'
import { temporaryPassword } from './passwords.js'
import { HttpError, cleanReason, idParam, ts, withTransaction } from './util.js'

/*
 * The admin team. Every admin is a super admin; the guard rails are that you
 * can't disable yourself and the last active admin can't be disabled.
 * Temporary passwords are returned once and must be changed at first sign-in.
 */
export function registerAdminTeamRoutes(router, { pool }) {
  function adminId(request) {
    const id = idParam(request.params.id)
    if (!id) throw new HttpError(400, 'Invalid admin.')
    return id
  }

  async function lockAdmin(db, id) {
    const [rows] = await db.execute('SELECT admin_id, email, full_name, status FROM admin_users WHERE admin_id = ? FOR UPDATE', [id])
    if (!rows[0]) throw new HttpError(404, 'Admin not found.')
    return rows[0]
  }

  router.get('/admins', async (_request, response) => {
    const [rows] = await pool.query(
      `SELECT a.admin_id, a.email, a.full_name, a.role, a.status, a.must_change_password,
              ${ts('a.last_login_at')}, ${ts('a.created_at')},
              a.locked_until > NOW() AS locked, creator.full_name AS created_by_name,
              (SELECT COUNT(*) FROM admin_sessions s
               WHERE s.admin_id = a.admin_id AND s.revoked_at IS NULL AND s.expires_at > NOW()) AS sessions
       FROM admin_users a LEFT JOIN admin_users creator ON creator.admin_id = a.created_by
       ORDER BY a.status = 'active' DESC, a.full_name`,
    )
    response.json({
      admins: rows.map((row) => ({
        ...publicAdmin(row),
        locked: Boolean(row.locked),
        sessions: Number(row.sessions),
        createdBy: row.created_by_name,
      })),
    })
  })

  router.post('/admins', async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
    const name = cleanReason(request.body?.name, 100)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email address.')
    if (!name) throw new HttpError(400, 'Enter their name.')
    const password = temporaryPassword()
    const hash = await bcrypt.hash(password, 12)
    const created = await withTransaction(pool, async (db) => {
      const [existing] = await db.execute('SELECT 1 FROM admin_users WHERE email = ? LIMIT 1', [email])
      if (existing[0]) throw new HttpError(409, 'An admin with this email already exists.')
      const [result] = await db.execute(
        `INSERT INTO admin_users (email, full_name, password_hash, role, must_change_password, created_by)
         VALUES (?, ?, ?, 'super_admin', TRUE, ?)`,
        [email, name, hash, request.admin.id],
      )
      await writeAudit(db, request, 'admin.created', { targetType: 'admin', targetId: result.insertId, details: { email, name } })
      return result.insertId
    })
    response.status(201).json({
      id: Number(created),
      temporaryPassword: password,
      message: 'Admin created. Share the temporary password privately; it is shown only once.',
    })
  })

  router.patch('/admins/:id', async (request, response) => {
    const id = adminId(request)
    const status = request.body?.status
    if (!['active', 'disabled'].includes(status)) throw new HttpError(400, 'Choose active or disabled.')
    if (status === 'disabled' && id === request.admin.id) throw new HttpError(409, "You can't disable your own account.")
    await withTransaction(pool, async (db) => {
      const admin = await lockAdmin(db, id)
      if (admin.status === status) throw new HttpError(409, `This admin is already ${status}.`)
      if (status === 'disabled') {
        const [[{ active }]] = await db.query("SELECT COUNT(*) AS active FROM admin_users WHERE status = 'active' FOR UPDATE")
        if (Number(active) <= 1) throw new HttpError(409, "The last active admin can't be disabled.")
        await db.execute('UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_id = ? AND revoked_at IS NULL', [id])
      }
      await db.execute('UPDATE admin_users SET status = ?, failed_attempts = 0, locked_until = NULL WHERE admin_id = ?', [status, id])
      await writeAudit(db, request, status === 'disabled' ? 'admin.disabled' : 'admin.enabled', {
        targetType: 'admin', targetId: id, details: { email: admin.email },
      })
    })
    response.json({ message: status === 'disabled' ? 'Admin disabled and signed out.' : 'Admin enabled.' })
  })

  router.post('/admins/:id/reset-password', async (request, response) => {
    const id = adminId(request)
    if (id === request.admin.id) throw new HttpError(409, 'Change your own password from your account page.')
    const password = temporaryPassword()
    const hash = await bcrypt.hash(password, 12)
    await withTransaction(pool, async (db) => {
      const admin = await lockAdmin(db, id)
      await db.execute(
        `UPDATE admin_users SET password_hash = ?, must_change_password = TRUE, failed_attempts = 0, locked_until = NULL
         WHERE admin_id = ?`,
        [hash, id],
      )
      await db.execute('UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_id = ? AND revoked_at IS NULL', [id])
      await writeAudit(db, request, 'admin.password_reset', { targetType: 'admin', targetId: id, details: { email: admin.email } })
    })
    response.json({ temporaryPassword: password, message: 'Password reset and sessions signed out. The new password is shown only once.' })
  })

  router.delete('/admins/:id/sessions', async (request, response) => {
    const id = adminId(request)
    const revoked = await withTransaction(pool, async (db) => {
      const admin = await lockAdmin(db, id)
      const [result] = await db.execute(
        `UPDATE admin_sessions SET revoked_at = NOW()
         WHERE admin_id = ? AND revoked_at IS NULL AND session_id <> ?`,
        [id, request.admin.sessionId],
      )
      await writeAudit(db, request, 'admin.sessions_revoked', {
        targetType: 'admin', targetId: id, details: { email: admin.email, sessions: result.affectedRows },
      })
      return result.affectedRows
    })
    response.json({ message: `${revoked} session${revoked === 1 ? '' : 's'} signed out.` })
  })
}
