import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { randomUUID } from 'node:crypto'
import dotenv from 'dotenv'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import mysql from 'mysql2/promise'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) })

const app = express()
const port = Number(process.env.PORT || 3001)
const jwtSecret = process.env.JWT_SECRET
const isProduction = process.env.NODE_ENV === 'production'
const cookieName = 'spontii_session'

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('Set JWT_SECRET to a random value of at least 32 characters in server/.env.')
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'spontiii',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
}
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
})
const profileFields = ['photo', 'city', 'tagline', 'bio', 'tags']

app.use(helmet())
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

if (process.env.FRONTEND_ORIGIN) {
  app.use(cors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  }))
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
})

function publicUser(row) {
  const tags = profileTags(row.profile_tags)
  const profileCompletion = calculateProfileCompletion(row)

  return {
    id: row.client_id,
    name: row.full_name,
    phone: row.phone_number,
    email: row.email,
    spontiiiId: row.spontiii_id,
    city: row.profile_city || '',
    tagline: row.profile_tagline || '',
    bio: row.profile_bio || '',
    tags,
    avatar: row.profile_photo_mime ? `/api/profile/photo?v=${Date.now()}` : null,
    profileCompletion,
    spontiiScore: Number(row.spontii_score),
    createdAt: row.created_at,
  }
}

function profileTags(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return JSON.parse(value || '[]')
  return []
}

function calculateProfileCompletion(profile) {
  const tags = profileTags(profile.profile_tags)
  const completed = [
    Boolean(profile.profile_photo_mime),
    Boolean(profile.profile_city?.trim()),
    Boolean(profile.profile_tagline?.trim()),
    Boolean(profile.profile_bio?.trim()),
    tags.length > 0,
  ].filter(Boolean).length
  return Math.round((completed / profileFields.length) * 100)
}

function profileScore(completion) {
  return 20 +
    (completion >= 50 ? 45 : 0) +
    (completion >= 75 ? 20 : 0) +
    (completion >= 100 ? 35 : 0)
}

function selectProfile(clientId) {
  return pool.execute(
    `SELECT client_id, full_name, phone_number, email, spontiii_id,
            profile_city, profile_tagline, profile_bio, profile_tags,
            profile_photo_mime, spontii_score, created_at
     FROM clients WHERE client_id = ? LIMIT 1`,
    [clientId],
  )
}

function setSessionCookie(response, clientId) {
  const token = jwt.sign(
    { sub: String(clientId) },
    jwtSecret,
    { expiresIn: '7d' },
  )

  response.cookie(cookieName, token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

function validateSignup(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const rawPhone = typeof body?.phone === 'string' ? body.phone.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const digits = rawPhone.replace(/\D/g, '')
  const phone = rawPhone.startsWith('+') ? `+${digits}` : digits

  if (!name || name.length > 100) {
    return { message: 'Enter your name (up to 100 characters).' }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { message: 'Enter a valid email address.' }
  }

  if (!/^\+?[0-9\s().-]{7,20}$/.test(rawPhone) || digits.length < 7 || digits.length > 15) {
    return { message: 'Enter a valid phone number.' }
  }

  if (password.length < 8 || password.length > 128) {
    return { message: 'Password must be between 8 and 128 characters.' }
  }

  return { value: { name, email, phone, password } }
}

function requireSession(request, response, next) {
  const token = request.cookies[cookieName]

  if (!token) {
    return response.status(401).json({ message: 'Please log in.' })
  }

  try {
    const payload = jwt.verify(token, jwtSecret)
    request.clientId = Number(payload.sub)
    return next()
  } catch {
    response.clearCookie(cookieName, cookieOptions)
    return response.status(401).json({ message: 'Your session has expired. Please log in again.' })
  }
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.post('/api/auth/signup', authLimiter, async (request, response, next) => {
  const validation = validateSignup(request.body)

  if (validation.message) {
    return response.status(400).json({ message: validation.message })
  }

  try {
    const { name, phone, email, password } = validation.value
    const passwordHash = await bcrypt.hash(password, 12)
    const spontiiiId = `SPONTIII-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
    await pool.execute(
      `INSERT INTO clients
         (full_name, phone_number, email, password_hash, spontiii_id, spontii_score)
       VALUES (?, ?, ?, ?, ?, 20)`,
      [name, phone, email, passwordHash, spontiiiId],
    )

    response.clearCookie(cookieName, cookieOptions)
    response.status(201).json({
      message: 'Account created. Please log in to continue.',
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({
        message: 'An account with this email or phone number already exists.',
      })
    }
    next(error)
  }
})

app.post('/api/auth/login', authLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === 'string'
    ? request.body.email.trim().toLowerCase()
    : ''
  const password = typeof request.body?.password === 'string'
    ? request.body.password
    : ''

  if (!email || !password || email.length > 254 || password.length > 128) {
    return response.status(400).json({ message: 'Enter your email and password.' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT client_id, full_name, phone_number, email, password_hash,
              spontiii_id, profile_city, profile_tagline, profile_bio, profile_tags,
              profile_photo_mime, spontii_score, created_at
       FROM clients WHERE email = ? LIMIT 1`,
      [email],
    )
    const client = rows[0]

    if (!client || !(await bcrypt.compare(password, client.password_hash))) {
      return response.status(401).json({ message: 'Invalid email or password.' })
    }

    setSessionCookie(response, client.client_id)
    const [profileRows] = await selectProfile(client.client_id)
    response.json({ user: publicUser(profileRows[0]) })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', requireSession, async (request, response, next) => {
  try {
    const [rows] = await selectProfile(request.clientId)

    if (!rows[0]) {
      response.clearCookie(cookieName, cookieOptions)
      return response.status(401).json({ message: 'Account not found.' })
    }

    response.json({ user: publicUser(rows[0]) })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/profile', requireSession, async (request, response, next) => {
  const body = request.body || {}
  const updates = []
  const values = []

  if (Object.hasOwn(body, 'name')) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 100) {
      return response.status(400).json({ message: 'Enter your name (up to 100 characters).' })
    }
    updates.push('full_name = ?')
    values.push(name)
  }

  const textFields = [
    ['city', 'profile_city', 80],
    ['tagline', 'profile_tagline', 160],
    ['bio', 'profile_bio', 500],
  ]

  for (const [key, column, maxLength] of textFields) {
    if (!Object.hasOwn(body, key)) continue
    if (typeof body[key] !== 'string' || body[key].trim().length > maxLength) {
      return response.status(400).json({ message: `${key} must be no more than ${maxLength} characters.` })
    }
    updates.push(`${column} = ?`)
    values.push(body[key].trim())
  }

  if (Object.hasOwn(body, 'tags')) {
    if (!Array.isArray(body.tags) || body.tags.length > 12 ||
        body.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 30)) {
      return response.status(400).json({ message: 'Add up to 12 valid tags, each no more than 30 characters.' })
    }
    updates.push('profile_tags = ?')
    values.push(JSON.stringify([...new Set(body.tags.map((tag) => tag.trim()))]))
  }

  if (!updates.length) {
    return response.status(400).json({ message: 'No profile changes were provided.' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    await connection.execute(
      `UPDATE clients SET ${updates.join(', ')} WHERE client_id = ?`,
      [...values, request.clientId],
    )
    const [rows] = await connection.execute(
      `SELECT profile_city, profile_tagline, profile_bio, profile_tags, profile_photo_mime
       FROM clients WHERE client_id = ? FOR UPDATE`,
      [request.clientId],
    )
    const profile = rows[0]
    const completion = calculateProfileCompletion(profile)

    await connection.execute(
      'UPDATE clients SET spontii_score = ? WHERE client_id = ?',
      [profileScore(completion), request.clientId],
    )
    await connection.commit()

    const [updatedRows] = await selectProfile(request.clientId)
    response.json({ user: publicUser(updatedRows[0]) })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.post(
  '/api/profile/photo',
  requireSession,
  photoUpload.single('photo'),
  async (request, response, next) => {
    const photo = request.file
    if (!photo) {
      return response.status(400).json({ message: 'Choose a profile photo to upload.' })
    }

    const bytes = photo.buffer
    let mimeType
    if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      mimeType = 'image/jpeg'
    } else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      mimeType = 'image/png'
    } else if (
      bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP'
    ) {
      mimeType = 'image/webp'
    } else {
      return response.status(400).json({ message: 'Upload a valid JPG, PNG, or WebP image.' })
    }

    let connection
    try {
      connection = await pool.getConnection()
      await connection.beginTransaction()
      await connection.execute(
        `UPDATE clients SET profile_photo = ?, profile_photo_mime = ?
         WHERE client_id = ?`,
        [bytes, mimeType, request.clientId],
      )
      const [rows] = await connection.execute(
        `SELECT profile_city, profile_tagline, profile_bio, profile_tags, profile_photo_mime
         FROM clients WHERE client_id = ? FOR UPDATE`,
        [request.clientId],
      )
      const completion = calculateProfileCompletion(rows[0])
      await connection.execute(
        'UPDATE clients SET spontii_score = ? WHERE client_id = ?',
        [profileScore(completion), request.clientId],
      )
      await connection.commit()
      const [updatedRows] = await selectProfile(request.clientId)
      response.json({ user: publicUser(updatedRows[0]) })
    } catch (error) {
      if (connection) await connection.rollback()
      next(error)
    } finally {
      connection?.release()
    }
  },
)

app.get('/api/profile/photo', requireSession, async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT profile_photo, profile_photo_mime
       FROM clients WHERE client_id = ? LIMIT 1`,
      [request.clientId],
    )
    const profilePhoto = rows[0]
    if (!profilePhoto?.profile_photo) {
      return response.status(404).end()
    }

    response.set('Content-Type', profilePhoto.profile_photo_mime)
    response.set('Cache-Control', 'private, no-store')
    response.send(profilePhoto.profile_photo)
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/logout', (_request, response) => {
  response.clearCookie(cookieName, cookieOptions)
  response.status(204).end()
})

app.use((error, _request, response, _next) => {
  console.error('API request failed:', error)
  if (response.headersSent) return
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    return response.status(status).json({
      message: status === 413
        ? 'Profile photos must be 5 MB or smaller.'
        : 'Could not process the uploaded photo.',
    })
  }
  if (error.code === 'ER_DUP_ENTRY') {
    return response.status(409).json({ message: 'This Spontiii ID is already in use. Please retry.' })
  }
  response.status(500).json({ message: 'The server could not complete your request.' })
})

async function start() {
  await pool.query('SELECT 1')
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clients (
      client_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      full_name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      email VARCHAR(254) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      spontiii_id VARCHAR(40) NULL,
      profile_city VARCHAR(80) NULL,
      profile_tagline VARCHAR(160) NULL,
      profile_bio VARCHAR(500) NULL,
      profile_tags JSON NULL,
      profile_photo MEDIUMBLOB NULL,
      profile_photo_mime VARCHAR(50) NULL,
      spontii_score INT UNSIGNED NOT NULL DEFAULT 20,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (client_id),
      UNIQUE KEY uq_clients_phone_number (phone_number),
      UNIQUE KEY uq_clients_email (email)
    ) ENGINE=InnoDB
      DEFAULT CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci
  `)

  const profileColumns = [
    ['spontiii_id', 'VARCHAR(40) NULL'],
    ['profile_city', 'VARCHAR(80) NULL'],
    ['profile_tagline', 'VARCHAR(160) NULL'],
    ['profile_bio', 'VARCHAR(500) NULL'],
    ['profile_tags', 'JSON NULL'],
    ['profile_photo', 'MEDIUMBLOB NULL'],
    ['profile_photo_mime', 'VARCHAR(50) NULL'],
    ['spontii_score', 'INT UNSIGNED NOT NULL DEFAULT 20'],
  ]
  const [existingColumns] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients'`,
  )
  const existingColumnNames = new Set(existingColumns.map((column) => column.COLUMN_NAME))

  for (const [columnName, definition] of profileColumns) {
    if (!existingColumnNames.has(columnName)) {
      await pool.query(`ALTER TABLE clients ADD COLUMN ${columnName} ${definition}`)
    }
  }

  const [indexes] = await pool.query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients'`,
  )
  const indexNames = new Set(indexes.map((index) => index.INDEX_NAME))
  if (!indexNames.has('uq_clients_spontiii_id')) {
    await pool.query('ALTER TABLE clients ADD UNIQUE KEY uq_clients_spontiii_id (spontiii_id)')
  }

  const [clients] = await pool.query(
    'SELECT client_id FROM clients WHERE spontiii_id IS NULL OR spontiii_id = ""',
  )
  for (const client of clients) {
    const spontiiiId = `SPONTIII-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
    await pool.execute(
      'UPDATE clients SET spontiii_id = ? WHERE client_id = ?',
      [spontiiiId, client.client_id],
    )
  }

  app.listen(port, () => {
    console.log(`Spontii API listening on http://localhost:${port}`)
  })
}

start().catch((error) => {
  console.error(`Unable to connect to database "${process.env.DB_NAME || 'spontiii'}":`, error.message)
  process.exitCode = 1
})
