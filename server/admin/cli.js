#!/usr/bin/env node
/*
 * Admin account recovery from the server shell:
 *   npm run admin -- create <email> "<full name>"
 *   npm run admin -- reset-password <email>
 *   npm run admin -- unlock <email>
 * Temporary passwords are printed once and must be changed at the next sign-in.
 */
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import mysql from 'mysql2/promise'
import { fileURLToPath } from 'node:url'
import { createAdminTables } from './schema.js'
import { temporaryPassword } from './passwords.js'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })

const [command, rawEmail, ...nameParts] = process.argv.slice(2)
const email = (rawEmail || '').trim().toLowerCase()
const usage = 'Usage: npm run admin -- <create|reset-password|unlock> <email> ["Full Name"]'

if (!['create', 'reset-password', 'unlock'].includes(command) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error(usage)
  process.exit(1)
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'spontiii',
  connectionLimit: 1,
  timezone: 'Z',
})

async function audit(action, adminId) {
  await pool.execute(
    `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, details)
     VALUES (NULL, ?, 'admin', ?, ?)`,
    [action, String(adminId), JSON.stringify({ via: 'cli' })],
  )
}

try {
  await createAdminTables(pool)
  const [rows] = await pool.execute('SELECT admin_id FROM admin_users WHERE email = ? LIMIT 1', [email])
  const admin = rows[0]

  if (command === 'create') {
    if (admin) throw new Error(`An admin with ${email} already exists.`)
    const password = temporaryPassword()
    const name = nameParts.join(' ').trim().slice(0, 100) || 'Spontii Admin'
    const [result] = await pool.execute(
      `INSERT INTO admin_users (email, full_name, password_hash, role, must_change_password)
       VALUES (?, ?, ?, 'super_admin', TRUE)`,
      [email, name, await bcrypt.hash(password, 12)],
    )
    await audit('admin.created', result.insertId)
    console.log(`Created super admin ${email}.\nTemporary password: ${password}`)
  } else if (!admin) {
    throw new Error(`No admin with ${email}.`)
  } else if (command === 'reset-password') {
    const password = temporaryPassword()
    await pool.execute(
      `UPDATE admin_users
       SET password_hash = ?, must_change_password = TRUE, failed_attempts = 0,
           locked_until = NULL, status = 'active'
       WHERE admin_id = ?`,
      [await bcrypt.hash(password, 12), admin.admin_id],
    )
    await pool.execute('UPDATE admin_sessions SET revoked_at = NOW() WHERE admin_id = ? AND revoked_at IS NULL', [admin.admin_id])
    await audit('admin.password_reset', admin.admin_id)
    console.log(`Password reset for ${email}. All sessions signed out.\nTemporary password: ${password}`)
  } else {
    await pool.execute(
      "UPDATE admin_users SET failed_attempts = 0, locked_until = NULL, status = 'active' WHERE admin_id = ?",
      [admin.admin_id],
    )
    await audit('admin.unlocked', admin.admin_id)
    console.log(`Unlocked ${email}.`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
