import bcrypt from 'bcryptjs'
import { passwordProblem } from './passwords.js'

/*
 * Creates the first super admin from SUPER_ADMIN_* in server/.env, only when
 * no admin exists yet. It never changes an existing admin, so editing .env
 * later has no effect; use `npm run admin -- reset-password <email>` instead.
 */
export async function seedSuperAdmin(pool) {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM admin_users')
  if (Number(total) > 0) return

  const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase()
  const password = process.env.SUPER_ADMIN_PASSWORD || ''
  const name = (process.env.SUPER_ADMIN_NAME || 'Spontii Super Admin').trim().slice(0, 100)

  if (!email || !password) {
    console.warn(
      'No admin account exists. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in server/.env and restart to create the first super admin.',
    )
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    console.error('SUPER_ADMIN_EMAIL is not a valid email address; the super admin was not created.')
    return
  }
  const problem = passwordProblem(password, email)
  if (problem) {
    console.error(`SUPER_ADMIN_PASSWORD rejected: ${problem} The super admin was not created.`)
    return
  }

  await pool.execute(
    `INSERT INTO admin_users (email, full_name, password_hash, role, must_change_password)
     VALUES (?, ?, ?, 'super_admin', TRUE)`,
    [email, name, await bcrypt.hash(password, 12)],
  )
  console.log(
    `Created super admin ${email}. Sign in at /admin, change the password, then remove SUPER_ADMIN_PASSWORD from server/.env.`,
  )
}
