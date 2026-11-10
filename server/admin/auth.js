import bcrypt from 'bcryptjs'
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import rateLimit from 'express-rate-limit'
import { sendOtpEmail } from '../mail.js'
import { writeAudit } from './audit.js'
import { passwordProblem } from './passwords.js'
import { HttpError, idParam, isUuid, iso, ts, withTransaction } from './util.js'

/*
 * Admin sign-in: password, then a one-time code emailed to the admin.
 * The session is an opaque random token stored only as a SHA-256 hash, so it
 * can be listed and revoked, and it can never be confused with a user JWT.
 */

export const ADMIN_COOKIE = 'spontii_admin_session'
const OTP_TTL_MINUTES = 5
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_SECONDS = 30
const MAX_FAILED_PASSWORDS = 5
const LOCK_MINUTES = 15
/* Compared against when the email is unknown, so timing doesn't reveal which admins exist. */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString('hex'), 12)
const PASSWORD_CHANGE_PATHS = new Set(['/auth/me', '/auth/logout', '/auth/password', '/auth/sessions'])

const sessionHours = () => Math.min(Math.max(Number(process.env.ADMIN_SESSION_HOURS) || 8, 1), 72)
const idleMinutes = () => Math.min(Math.max(Number(process.env.ADMIN_IDLE_MINUTES) || 60, 5), 24 * 60)

/* Per IP; the per-account lockout and per-code attempt limits sit on top. */
const signInLimiter = (limit) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Please try again later.' },
})
const loginLimiter = signInLimiter(10)
const verifyLimiter = signInLimiter(20)
const resendLimiter = signInLimiter(10)

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeIp(ip) {
  return (ip || '').replace(/^::ffff:/, '')
}

export function publicAdmin(row) {
  return {
    id: Number(row.admin_id),
    email: row.email,
    name: row.full_name,
    role: row.role,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    lastLoginAt: iso(row.last_login_at),
    createdAt: iso(row.created_at),
  }
}

function maskEmail(email) {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(local.length - 2, 1))}@${domain}`
}

/* Hides the admin API from addresses outside ADMIN_IP_ALLOWLIST, when it is set. */
export function ipAllowlist(request, response, next) {
  const allowed = (process.env.ADMIN_IP_ALLOWLIST || '')
    .split(',').map((value) => value.trim()).filter(Boolean)
  if (!allowed.length || allowed.includes(normalizeIp(request.ip))) return next()
  return response.status(404).json({ message: 'Not found.' })
}

export function createAdminAuth({ pool, cookieOptions, otpSecret }) {
  const adminCookieOptions = { ...cookieOptions, path: '/api/admin' }

  const hashOtp = (challengeId, otp) =>
    createHmac('sha256', otpSecret).update(`admin-otp:${challengeId}:${otp}`).digest('hex')

  function clearSessionCookie(response) {
    response.clearCookie(ADMIN_COOKIE, adminCookieOptions)
  }

  async function createSession(db, request, response, adminId) {
    const token = randomBytes(32).toString('base64url')
    await db.execute(
      `INSERT INTO admin_sessions (token_hash, admin_id, ip, user_agent, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, NOW(), NOW() + INTERVAL ? HOUR)`,
      [hashToken(token), adminId, normalizeIp(request.ip), request.get('user-agent')?.slice(0, 255) ?? null, sessionHours()],
    )
    response.cookie(ADMIN_COOKIE, token, { ...adminCookieOptions, maxAge: sessionHours() * 60 * 60 * 1000 })
  }

  async function issueChallenge(db, admin) {
    const challengeId = randomUUID()
    const otp = String(randomInt(0, 1000000)).padStart(6, '0')
    await db.execute('DELETE FROM admin_login_challenges WHERE admin_id = ?', [admin.admin_id])
    await db.execute(
      `INSERT INTO admin_login_challenges (challenge_id, admin_id, otp_hash, otp_expires_at, last_sent_at)
       VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE, NOW())`,
      [challengeId, admin.admin_id, hashOtp(challengeId, otp), OTP_TTL_MINUTES],
    )
    return { challengeId, otp }
  }

  async function requireAdmin(request, response, next) {
    const token = request.cookies[ADMIN_COOKIE]
    if (!token) {
      return response.status(401).json({ code: 'ADMIN_AUTH_REQUIRED', message: 'Please sign in to the admin portal.' })
    }
    const [rows] = await pool.execute(
      `SELECT s.session_id, s.revoked_at, s.expires_at <= NOW() AS expired,
              TIMESTAMPDIFF(MINUTE, s.last_seen_at, NOW()) AS idle_minutes,
              a.admin_id, a.email, a.full_name, a.role, a.status, a.must_change_password
       FROM admin_sessions s JOIN admin_users a ON a.admin_id = s.admin_id
       WHERE s.token_hash = ? LIMIT 1`,
      [hashToken(token)],
    )
    const session = rows[0]
    if (!session || session.revoked_at || session.expired ||
        Number(session.idle_minutes) >= idleMinutes() || session.status !== 'active') {
      clearSessionCookie(response)
      return response.status(401).json({ code: 'ADMIN_SESSION_EXPIRED', message: 'Your admin session ended. Please sign in again.' })
    }
    if (Number(session.idle_minutes) >= 1) {
      await pool.execute('UPDATE admin_sessions SET last_seen_at = NOW() WHERE session_id = ?', [session.session_id])
    }
    request.admin = {
      id: Number(session.admin_id),
      email: session.email,
      name: session.full_name,
      role: session.role,
      sessionId: Number(session.session_id),
      mustChangePassword: Boolean(session.must_change_password),
    }
    if (request.admin.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(request.path)) {
      return response.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: 'Change your password to continue.' })
    }
    return next()
  }

  /* Public routes: sign in, verify, resend, logout. */
  function registerPublicRoutes(router) {
    router.post('/auth/login', loginLimiter, async (request, response) => {
      const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
      const password = typeof request.body?.password === 'string' ? request.body.password : ''
      if (!email || !password || email.length > 254 || password.length > 128) {
        return response.status(400).json({ message: 'Enter your email and password.' })
      }

      const [rows] = await pool.execute(
        `SELECT admin_id, email, full_name, password_hash, status, failed_attempts,
                TIMESTAMPDIFF(SECOND, NOW(), locked_until) AS locked_seconds
         FROM admin_users WHERE email = ? LIMIT 1`,
        [email],
      )
      const admin = rows[0]
      const passwordOk = await bcrypt.compare(password, admin?.password_hash || DUMMY_HASH)
      const invalid = () => response.status(401).json({ message: 'Invalid email or password.' })
      if (!admin) return invalid()

      if (Number(admin.locked_seconds) > 0) {
        return response.status(423).json({
          message: `Too many failed attempts. Try again in ${Math.ceil(Number(admin.locked_seconds) / 60)} minutes.`,
        })
      }
      if (!passwordOk) {
        const locking = Number(admin.failed_attempts) + 1 >= MAX_FAILED_PASSWORDS
        await withTransaction(pool, async (db) => {
          await db.execute(
            locking
              ? `UPDATE admin_users SET failed_attempts = 0, locked_until = NOW() + INTERVAL ${LOCK_MINUTES} MINUTE WHERE admin_id = ?`
              : 'UPDATE admin_users SET failed_attempts = failed_attempts + 1 WHERE admin_id = ?',
            [admin.admin_id],
          )
          await writeAudit(db, request, locking ? 'admin.locked' : 'admin.login_failed', {
            targetType: 'admin', targetId: admin.admin_id,
          })
        })
        return invalid()
      }
      if (admin.status !== 'active') {
        return response.status(403).json({ message: 'This admin account is disabled.' })
      }

      const { challengeId, otp } = await withTransaction(pool, async (db) => {
        await db.execute(
          'UPDATE admin_users SET failed_attempts = 0, locked_until = NULL WHERE admin_id = ?',
          [admin.admin_id],
        )
        return issueChallenge(db, admin)
      })
      try {
        await sendOtpEmail({ to: admin.email, name: admin.full_name, otp, minutes: OTP_TTL_MINUTES, purpose: 'admin_login' })
      } catch (mailError) {
        console.error('Failed to send admin login code:', mailError.message)
        await pool.execute('DELETE FROM admin_login_challenges WHERE challenge_id = ?', [challengeId])
        return response.status(502).json({ message: 'We could not email your login code. Check the mail settings and try again.' })
      }
      return response.json({
        challengeId,
        sentTo: maskEmail(admin.email),
        expiresInSeconds: OTP_TTL_MINUTES * 60,
        resendInSeconds: OTP_RESEND_SECONDS,
      })
    })

    router.post('/auth/verify', verifyLimiter, async (request, response) => {
      const { challengeId } = request.body || {}
      const otp = typeof request.body?.otp === 'string' ? request.body.otp.trim() : ''
      const invalid = () => response.status(400).json({ message: 'The code is invalid or expired. Sign in again if needed.' })
      if (!isUuid(challengeId) || !/^\d{6}$/.test(otp)) return invalid()

      const result = await withTransaction(pool, async (db) => {
        const [rows] = await db.execute(
          `SELECT c.challenge_id, c.otp_hash, c.attempts, c.otp_expires_at <= NOW() AS expired,
                  a.admin_id, a.email, a.full_name, a.role, a.status, a.must_change_password,
                  ${ts('a.last_login_at')}, ${ts('a.created_at')}
           FROM admin_login_challenges c JOIN admin_users a ON a.admin_id = c.admin_id
           WHERE c.challenge_id = ? FOR UPDATE`,
          [challengeId],
        )
        const challenge = rows[0]
        if (!challenge || challenge.expired || challenge.status !== 'active') return { error: 'invalid' }
        if (Number(challenge.attempts) >= OTP_MAX_ATTEMPTS) {
          await db.execute('DELETE FROM admin_login_challenges WHERE challenge_id = ?', [challengeId])
          return { error: 'attempts' }
        }
        const expected = Buffer.from(challenge.otp_hash)
        const given = Buffer.from(hashOtp(challengeId, otp))
        if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
          await db.execute('UPDATE admin_login_challenges SET attempts = attempts + 1 WHERE challenge_id = ?', [challengeId])
          return { error: 'invalid' }
        }
        await db.execute('DELETE FROM admin_login_challenges WHERE challenge_id = ?', [challengeId])
        await db.execute('UPDATE admin_users SET last_login_at = NOW() WHERE admin_id = ?', [challenge.admin_id])
        await createSession(db, request, response, challenge.admin_id)
        request.admin = { id: Number(challenge.admin_id) }
        await writeAudit(db, request, 'admin.login', { targetType: 'admin', targetId: challenge.admin_id })
        return { admin: challenge }
      })

      if (result.error === 'attempts') {
        return response.status(429).json({ message: 'Too many wrong codes. Sign in again to get a new one.' })
      }
      if (result.error) return invalid()
      const admin = publicAdmin(result.admin)
      return response.json({ admin, mustChangePassword: admin.mustChangePassword })
    })

    router.post('/auth/resend', resendLimiter, async (request, response) => {
      const { challengeId } = request.body || {}
      if (!isUuid(challengeId)) return response.status(400).json({ message: 'Sign in again to get a new code.' })
      const [rows] = await pool.execute(
        `SELECT c.challenge_id, TIMESTAMPDIFF(SECOND, c.last_sent_at, NOW()) AS since_last,
                a.admin_id, a.email, a.full_name
         FROM admin_login_challenges c JOIN admin_users a ON a.admin_id = c.admin_id
         WHERE c.challenge_id = ? AND a.status = 'active' LIMIT 1`,
        [challengeId],
      )
      const challenge = rows[0]
      if (!challenge) return response.status(400).json({ message: 'Sign in again to get a new code.' })
      if (Number(challenge.since_last) < OTP_RESEND_SECONDS) {
        return response.status(429).json({
          message: `Please wait ${OTP_RESEND_SECONDS - Number(challenge.since_last)}s before requesting another code.`,
        })
      }
      const otp = String(randomInt(0, 1000000)).padStart(6, '0')
      await pool.execute(
        `UPDATE admin_login_challenges
         SET otp_hash = ?, otp_expires_at = NOW() + INTERVAL ? MINUTE, attempts = 0, last_sent_at = NOW()
         WHERE challenge_id = ?`,
        [hashOtp(challengeId, otp), OTP_TTL_MINUTES, challengeId],
      )
      try {
        await sendOtpEmail({ to: challenge.email, name: challenge.full_name, otp, minutes: OTP_TTL_MINUTES, purpose: 'admin_login' })
      } catch (mailError) {
        console.error('Failed to resend admin login code:', mailError.message)
        return response.status(502).json({ message: 'We could not email your login code. Please try again.' })
      }
      return response.json({ expiresInSeconds: OTP_TTL_MINUTES * 60, resendInSeconds: OTP_RESEND_SECONDS })
    })

    router.post('/auth/logout', async (request, response) => {
      const token = request.cookies[ADMIN_COOKIE]
      if (token) {
        await pool.execute(
          'UPDATE admin_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = ?',
          [hashToken(token)],
        )
      }
      clearSessionCookie(response)
      response.status(204).end()
    })
  }

  /* Routes for the signed-in admin's own account. */
  function registerAccountRoutes(router) {
    router.get('/auth/me', async (request, response) => {
      const [rows] = await pool.execute(
        `SELECT admin_id, email, full_name, role, status, must_change_password,
                ${ts('last_login_at')}, ${ts('created_at')}
         FROM admin_users WHERE admin_id = ? LIMIT 1`,
        [request.admin.id],
      )
      response.json({ admin: publicAdmin(rows[0]) })
    })

    router.get('/auth/sessions', async (request, response) => {
      const [rows] = await pool.execute(
        `SELECT session_id, ip, user_agent, ${ts('created_at')}, ${ts('last_seen_at')}, ${ts('expires_at')}
         FROM admin_sessions
         WHERE admin_id = ? AND revoked_at IS NULL AND expires_at > NOW()
         ORDER BY last_seen_at DESC LIMIT 50`,
        [request.admin.id],
      )
      response.json({
        sessions: rows.map((row) => ({
          id: String(row.session_id),
          ip: row.ip,
          userAgent: row.user_agent,
          createdAt: iso(row.created_at),
          lastSeenAt: iso(row.last_seen_at),
          expiresAt: iso(row.expires_at),
          current: Number(row.session_id) === request.admin.sessionId,
        })),
      })
    })

    router.delete('/auth/sessions/:id', async (request, response) => {
      const sessionId = idParam(request.params.id)
      if (!sessionId) throw new HttpError(400, 'Invalid session.')
      await withTransaction(pool, async (db) => {
        const [result] = await db.execute(
          `UPDATE admin_sessions SET revoked_at = NOW()
           WHERE session_id = ? AND admin_id = ? AND revoked_at IS NULL`,
          [sessionId, request.admin.id],
        )
        if (result.affectedRows !== 1) throw new HttpError(404, 'Session not found.')
        await writeAudit(db, request, 'admin.session_revoked', { targetType: 'admin_session', targetId: sessionId })
      })
      if (sessionId === request.admin.sessionId) clearSessionCookie(response)
      response.status(204).end()
    })

    router.post('/auth/password', async (request, response) => {
      const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : ''
      const newPassword = typeof request.body?.newPassword === 'string' ? request.body.newPassword : ''
      const [rows] = await pool.execute(
        'SELECT password_hash FROM admin_users WHERE admin_id = ? LIMIT 1',
        [request.admin.id],
      )
      if (!rows[0] || !currentPassword || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
        throw new HttpError(400, 'Your current password is incorrect.')
      }
      const problem = passwordProblem(newPassword, request.admin.email)
      if (problem) throw new HttpError(400, problem)
      if (newPassword === currentPassword) throw new HttpError(400, 'Choose a password you have not just used.')

      const hash = await bcrypt.hash(newPassword, 12)
      await withTransaction(pool, async (db) => {
        await db.execute(
          'UPDATE admin_users SET password_hash = ?, must_change_password = FALSE WHERE admin_id = ?',
          [hash, request.admin.id],
        )
        await db.execute(
          `UPDATE admin_sessions SET revoked_at = NOW()
           WHERE admin_id = ? AND session_id <> ? AND revoked_at IS NULL`,
          [request.admin.id, request.admin.sessionId],
        )
        await writeAudit(db, request, 'admin.password_changed', { targetType: 'admin', targetId: request.admin.id })
      })
      response.json({ message: 'Password changed. Your other sessions were signed out.' })
    })
  }

  return { requireAdmin, registerPublicRoutes, registerAccountRoutes, clearSessionCookie }
}
