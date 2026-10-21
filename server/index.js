import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import dotenv from 'dotenv'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import mysql from 'mysql2/promise'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import {
  attachChatSocket,
  blockStatus,
  cleanupExpiredMessages,
  createChatTables,
  isBlockedBetween,
  notifyDirectAccess,
  notifyEventClosed,
  notifyInBackground,
  registerChatRoutes,
} from './chat.js'
import { sendOtpEmail } from './mail.js'

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
  timezone: 'Z',
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
const activityUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 8 },
  fileFilter: (_request, file, callback) => {
    if (/^image\/(jpeg|png|webp)$/.test(file.mimetype) ||
        /^video\/(mp4|webm|quicktime)$/.test(file.mimetype)) {
      callback(null, true)
      return
    }
    callback(new Error('Upload JPG, PNG, WebP, MP4, WebM, or MOV files only.'))
  },
})
const profileFields = ['photo', 'city', 'tagline', 'bio', 'tags']
const frontendOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (isProduction && !frontendOrigins.length) {
  console.warn('FRONTEND_ORIGIN is not set; browser requests that change data will be rejected.')
}

function isAllowedOrigin(origin) {
  if (!origin) return false
  if (frontendOrigins.includes(origin)) return true
  return !isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
}

app.use(helmet())
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser())

if (frontendOrigins.length) {
  app.use(cors({
    origin: frontendOrigins,
    credentials: true,
  }))
}

app.use((request, response, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next()
  const origin = request.get('origin')
  if (isAllowedOrigin(origin) || (!origin && !isProduction)) return next()
  return response.status(403).json({ message: 'This request origin is not allowed.' })
})

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

function publicPerson(row) {
  return {
    id: Number(row.client_id),
    name: row.full_name,
    city: row.profile_city || '',
    tagline: row.profile_tagline || '',
    bio: row.profile_bio || '',
    tags: profileTags(row.profile_tags),
    avatar: row.profile_photo_mime
      ? `/api/people/${row.client_id}/photo?v=${Date.now()}`
      : null,
    score: Number(row.spontii_score || 0),
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

function verifySessionToken(token) {
  if (!token) return null
  try {
    const payload = jwt.verify(token, jwtSecret)
    const clientId = Number(payload.sub)
    if (!Number.isSafeInteger(clientId) || clientId <= 0) return null
    return { clientId, expiresAt: payload.exp * 1000 }
  } catch {
    return null
  }
}

function requireSession(request, response, next) {
  const token = request.cookies[cookieName]
  if (!token) {
    return response.status(401).json({ message: 'Please log in.' })
  }

  const session = verifySessionToken(token)
  if (!session) {
    response.clearCookie(cookieName, cookieOptions)
    return response.status(401).json({ message: 'Your session has expired. Please log in again.' })
  }
  request.clientId = session.clientId
  return next()
}

function optionalSession(request, _response, next) {
  request.clientId = verifySessionToken(request.cookies[cookieName])?.clientId ?? null
  next()
}

function activityResponse(row, isHost = false, media = [], requestStatus = null) {
  const start = new Date(row.starts_at)
  const end = new Date(row.ends_at)
  const date = start.toLocaleDateString('en-IN', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
  const time = start.toLocaleTimeString('en-IN', {
    timeZone: 'UTC',
    hour: 'numeric',
    minute: '2-digit',
  })
  const eventTags = typeof row.event_tags === 'string'
    ? JSON.parse(row.event_tags || '[]')
    : row.event_tags || []
  const preferences = typeof row.preferences === 'string'
    ? JSON.parse(row.preferences || '[]')
    : row.preferences || []

  return {
    id: row.public_id,
    title: row.title,
    category: row.category,
    description: row.description,
    ...(row.visibility !== 'public' && { visibility: row.visibility }),
    vibe: [row.vibe],
    tags: Array.isArray(eventTags) ? eventTags : [],
    image: row.banner_image,
    host: {
      id: Number(row.host_id),
      name: row.host_name,
      city: row.host_city || row.city,
      avatar: null,
      score: Number(row.spontii_score || 0),
    },
    when: `${date} · ${time}`,
    date,
    time,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    durationMinutes: Math.round((end.getTime() - start.getTime()) / 60000),
    area: row.area,
    location: row.area,
    ...((isHost || requestStatus === 'approved') && row.landmark && { landmark: row.landmark }),
    ...((isHost || requestStatus === 'approved') && row.venue_address && { venue: row.venue_address }),
    ...((isHost || requestStatus === 'approved') && { venueName: row.venue_name || '' }),
    ...((isHost || requestStatus === 'approved') && row.latitude != null && row.longitude != null && {
      coordinates: [Number(row.latitude), Number(row.longitude)],
    }),
    city: row.city,
    state: row.state || '',
    status: row.status,
    isHost,
    databaseBacked: true,
    requestStatus,
    distance: '',
    badge: row.visibility === 'private' ? 'PRIVATE' : row.visibility === 'friends' ? 'FRIENDS' : 'NEW',
    capacity: Number(row.capacity),
    attendeeCount: Number(row.approved_attendee_count || 0) + 1,
    pendingRequestCount: isHost ? Number(row.pending_request_count || 0) : 0,
    requestCutoffMinutes: Number(row.join_request_cutoff_minutes || 15),
    going: [{
      id: Number(row.host_id),
      name: row.host_name,
      avatar: null,
    }],
    vibeMatches: 0,
    foodAvailable: Boolean(row.food_available),
    foodPreference: row.food_preference,
    attendeePreference: row.attendee_preference,
    experienceLevel: row.experience_level,
    preferences: Array.isArray(preferences) ? preferences : [],
    beveragesAvailable: Boolean(row.beverages_available),
    drinksAvailable: Boolean(row.drinks_available),
    photos: media.filter((item) => item.kind === 'image')
      .map((item) => `/api/activities/${row.public_id}/media/${item.id}`),
    videos: media.filter((item) => item.kind === 'video')
      .map((item) => `/api/activities/${row.public_id}/media/${item.id}`),
  }
}

const ACTIVITY_SELECT = `
  SELECT a.activity_id, a.public_id, a.host_client_id AS host_id,
         a.title, a.category, a.description, a.visibility, a.vibe,
         a.city, a.state, a.area, a.venue_name, a.venue_address, a.latitude,
         a.landmark, a.longitude, a.starts_at, a.ends_at, a.capacity,
         a.join_request_cutoff_minutes,
         a.food_available, a.food_preference, a.beverages_available,
         a.drinks_available, a.attendee_preference, a.experience_level,
         a.preferences, a.event_tags, a.banner_image, a.status, c.full_name AS host_name,
         c.profile_city AS host_city, c.spontii_score,
         (SELECT COUNT(*) FROM activity_join_requests jr
          WHERE jr.activity_id = a.activity_id AND jr.status = 'approved') AS approved_attendee_count,
         (SELECT COUNT(*) FROM activity_join_requests jr
          WHERE jr.activity_id = a.activity_id AND jr.status = 'pending') AS pending_request_count
  FROM activities a
  JOIN clients c ON c.client_id = a.host_client_id`

function toMysqlDateTime(value) {
  return value.toISOString().slice(0, 19).replace('T', ' ')
}

async function expireActivities() {
  await pool.execute(
    `UPDATE activities SET status = 'completed'
     WHERE status = 'active' AND ends_at <= UTC_TIMESTAMP()`,
  )
  await pool.execute(
    `UPDATE notifications n
     JOIN activities a
       ON n.dedupe_key = CONCAT('hosted-event:', a.public_id)
     SET n.dismissed_at = COALESCE(n.dismissed_at, NOW())
     WHERE n.type = 'hosted_event' AND a.ends_at <= UTC_TIMESTAMP()`,
  )
  await cleanupExpiredMessages(pool)
  await pool.execute('DELETE FROM activities WHERE ends_at <= UTC_TIMESTAMP()')
}

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.get('/api/activities', optionalSession, async (request, response, next) => {
  try {
    await expireActivities()
    const requestedState = typeof request.query.state === 'string'
      ? request.query.state.trim().slice(0, 80)
      : ''
    const [rows] = await pool.execute(
      `${ACTIVITY_SELECT}
       WHERE a.status = 'active' AND a.ends_at > UTC_TIMESTAMP()
         AND (
           a.host_client_id = ?
           OR EXISTS (
             SELECT 1 FROM activity_join_requests jr
             WHERE jr.activity_id = a.activity_id
               AND jr.applicant_client_id = ? AND jr.status = 'approved'
           )
           OR (a.visibility = 'public' AND (? = '' OR a.state = ?))
           OR (
             a.visibility = 'friends'
             AND EXISTS (
               SELECT 1 FROM friendships f
               WHERE f.status = 'accepted'
                 AND (
                   (f.client_low_id = a.host_client_id AND f.client_high_id = ?)
                   OR (f.client_high_id = a.host_client_id AND f.client_low_id = ?)
                 )
             )
           )
         )
       ORDER BY a.starts_at ASC`,
      [
        request.clientId || 0,
        request.clientId || 0,
        requestedState,
        requestedState,
        request.clientId || 0,
        request.clientId || 0,
      ],
    )
    const requestStatuses = new Map()
    if (request.clientId && rows.length) {
      const [requestRows] = await pool.execute(
        `SELECT a.public_id, jr.status
         FROM activity_join_requests jr
         JOIN activities a ON a.activity_id = jr.activity_id
         WHERE jr.applicant_client_id = ?
           AND a.public_id IN (${rows.map(() => '?').join(', ')})`,
        [request.clientId, ...rows.map((row) => row.public_id)],
      )
      for (const item of requestRows) requestStatuses.set(item.public_id, item.status)
    }
    const mediaByActivity = new Map()
    if (rows.length) {
      const placeholders = rows.map(() => '?').join(', ')
      const [mediaRows] = await pool.execute(
        `SELECT activity_id, media_id, media_kind
         FROM activity_media WHERE activity_id IN (${placeholders})`,
        rows.map((row) => row.activity_id),
      )
      for (const media of mediaRows) {
        const items = mediaByActivity.get(Number(media.activity_id)) || []
        items.push({ id: media.media_id, kind: media.media_kind })
        mediaByActivity.set(Number(media.activity_id), items)
      }
    }
    response.json({
      activities: rows.map((row) =>
        activityResponse(
          row,
          Number(row.host_id) === request.clientId,
          mediaByActivity.get(Number(row.activity_id)) || [],
          requestStatuses.get(row.public_id) || null,
        )),
    })
  } catch (error) {
    next(error)
  }
})

app.post(
  '/api/activities',
  requireSession,
  activityUpload.array('media', 8),
  async (request, response, next) => {
    let connection
    try {
      let details
      try {
        details = JSON.parse(request.body.details || '')
      } catch {
        return response.status(400).json({ message: 'Event details are invalid.' })
      }
      if (!details || typeof details !== 'object' || Array.isArray(details)) {
        return response.status(400).json({ message: 'Event details are invalid.' })
      }

      const title = typeof details.title === 'string' ? details.title.trim() : ''
      const category = typeof details.category === 'string' ? details.category.trim() : ''
      const description = typeof details.description === 'string' ? details.description.trim() : ''
      const city = typeof details.city === 'string' ? details.city.trim() : ''
      const area = typeof details.area === 'string' ? details.area.trim() : ''
      const venueName = typeof details.venueName === 'string' ? details.venueName.trim() : ''
      const venueAddress = typeof details.venueAddress === 'string' ? details.venueAddress.trim() : ''
      const startsAt = new Date(details.startsAt)
      const endsAt = new Date(details.endsAt)
      const capacity = Number(details.capacity)
      const requestCutoffMinutes = Number(details.requestCutoffMinutes ?? 15)
      const latitude = details.coordinates?.[0] == null ? null : Number(details.coordinates[0])
      const longitude = details.coordinates?.[1] == null ? null : Number(details.coordinates[1])
      const bannerImage = typeof details.bannerImage === 'string' ? details.bannerImage : ''
      const validFoodPreferences = ['any', 'vegetarian', 'non-vegetarian', 'both']
      const foodPreference = validFoodPreferences.includes(details.foodPreference)
        ? details.foodPreference
        : null
      const attendeePreference = typeof details.attendeePreference === 'string'
        ? details.attendeePreference.trim()
        : 'Anyone'
      const experienceLevel = typeof details.experienceLevel === 'string'
        ? details.experienceLevel.trim()
        : 'Any experience'
      const preferences = Array.isArray(details.preferences)
        ? [...new Set(details.preferences.filter((item) =>
          typeof item === 'string' && item.trim() && item.trim().length <= 80,
        ).map((item) => item.trim()))]
        : []
      const eventTags = Array.isArray(details.tags)
        ? [...new Set(details.tags.filter((tag) =>
          typeof tag === 'string' && /^[\p{L}\p{N}_-]{1,32}$/u.test(tag),
        ))]
        : []
      const visibility = ['friends', 'private'].includes(details.visibility)
        ? details.visibility
        : 'public'
      const state = typeof details.state === 'string' ? details.state.trim() : ''
      const vibe = typeof details.vibe === 'string' ? details.vibe.trim() : 'Social'

      if (!title || title.length > 120 || !category || category.length > 80 ||
          !city || city.length > 80 || state.length > 80 || !area || area.length > 160 ||
          !description || description.length > 5000 || venueName.length > 160 ||
          venueAddress.length > 300 || vibe.length > 60 ||
          attendeePreference.length > 80 || experienceLevel.length > 80 ||
          preferences.length > 12 || eventTags.length > 10 ||
          !Number.isInteger(capacity) ||
          capacity < 2 || capacity > 500 || Number.isNaN(startsAt.getTime()) ||
          !Number.isInteger(requestCutoffMinutes) || requestCutoffMinutes < 15 || requestCutoffMinutes > 10080 ||
          Number.isNaN(endsAt.getTime()) || startsAt <= new Date() ||
          endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 7 * 24 * 60 * 60 * 1000 ||
          !bannerImage || bannerImage.length > 1000 || !/^https?:\/\//i.test(bannerImage) &&
            !/^\/api\/activities\//.test(bannerImage) ||
          latitude === null || longitude === null ||
          (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
          (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) ||
          (latitude === null) !== (longitude === null)) {
        return response.status(400).json({ message: 'Check the required event details and event time.' })
      }

      const files = request.files || []
      const imageCount = files.filter((file) => file.mimetype.startsWith('image/')).length
      const videoCount = files.length - imageCount
      if (imageCount > 6 || videoCount > 2) {
        return response.status(400).json({ message: 'Add up to 6 photos and 2 videos.' })
      }

      connection = await pool.getConnection()
      await connection.beginTransaction()
      const [pointRows] = await connection.execute(
        `SELECT spontii_points, lifetime_activities_created
         FROM clients WHERE client_id = ? FOR UPDATE`,
        [request.clientId],
      )
      if (!pointRows[0]) {
        await connection.rollback()
        return response.status(401).json({ message: 'Account not found.' })
      }
      const pointsBalance = Number(pointRows[0].spontii_points)
      const activitiesCreated = Number(pointRows[0].lifetime_activities_created)
      const requiredPoints = 100 + activitiesCreated * 50
      if (pointsBalance < requiredPoints) {
        await connection.rollback()
        return response.status(403).json({
          code: 'INSUFFICIENT_SPONTII_POINTS',
          message: `You need ${requiredPoints} Spontii points to create activity ${activitiesCreated + 1}. You have ${pointsBalance}.`,
          points: pointsBalance,
          requiredPoints,
          activitiesCreated,
        })
      }

      const publicId = randomUUID()
      const [insertResult] = await connection.execute(
        `INSERT INTO activities
           (public_id, host_client_id, title, category, description, visibility,
            vibe, city, state, area, venue_name, venue_address, latitude, landmark, longitude,
            starts_at, ends_at, capacity, join_request_cutoff_minutes, food_available, food_preference,
            beverages_available, drinks_available, attendee_preference,
            experience_level, preferences, event_tags, banner_image)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          publicId,
          request.clientId,
          title,
          category,
          description,
          visibility,
          vibe || 'Social',
          city,
          state,
          area,
          venueName || null,
          venueAddress || null,
          latitude,
          typeof details.landmark === 'string' ? details.landmark.trim().slice(0, 200) || null : null,
          longitude,
          toMysqlDateTime(startsAt),
          toMysqlDateTime(endsAt),
          capacity,
          requestCutoffMinutes,
          details.foodAvailable === true,
          foodPreference,
          details.beveragesAvailable === true,
          details.drinksAvailable === true,
          attendeePreference,
          experienceLevel,
          JSON.stringify(preferences),
          JSON.stringify(eventTags),
          bannerImage,
        ],
      )

      for (const file of files) {
        await connection.execute(
          `INSERT INTO activity_media
             (activity_id, media_kind, mime_type, original_name, media_data)
           VALUES (?, ?, ?, ?, ?)`,
          [
            insertResult.insertId,
            file.mimetype.startsWith('image/') ? 'image' : 'video',
            file.mimetype,
            file.originalname.slice(0, 255),
            file.buffer,
          ],
        )
      }
      const [notificationResult] = await connection.execute(
        `INSERT INTO notifications
           (client_id, type, title, message, route, dedupe_key)
         VALUES (?, 'hosted_event', 'Your event is live', ?, ?, ?)`,
        [
          request.clientId,
          `${title} is live. You earned 50 Spontii points; open your event to manage it. This notification stays until the event ends or you complete it.`,
          `/activities/${publicId}`,
          `hosted-event:${publicId}`,
        ],
      )
      const [pointUpdate] = await connection.execute(
        `UPDATE clients
         SET spontii_points = spontii_points + 50,
             lifetime_activities_created = lifetime_activities_created + 1
         WHERE client_id = ?`,
        [request.clientId],
      )
      if (pointUpdate.affectedRows !== 1) {
        throw new Error('Could not award Spontii points for the new activity.')
      }
      await connection.commit()

      const [rows] = await pool.execute(
        `${ACTIVITY_SELECT} WHERE a.public_id = ? LIMIT 1`,
        [publicId],
      )
      const [mediaRows] = await pool.execute(
        `SELECT media_id AS id, media_kind AS kind
         FROM activity_media WHERE activity_id = ?`,
        [rows[0].activity_id],
      )
      response.status(201).json({
        activity: activityResponse(rows[0], true, mediaRows),
        notification: {
          id: String(notificationResult.insertId),
          type: 'hosted_event',
          title: 'Your event is live',
          message: `${title} is live. You earned 50 Spontii points; open your event to manage it. This notification stays until the event ends or you complete it.`,
          route: `/activities/${publicId}`,
          readAt: null,
          createdAt: new Date().toISOString(),
        },
        points: {
          balance: pointsBalance + 50,
          awarded: 50,
          activitiesCreated: activitiesCreated + 1,
          nextActivityCost: 100 + (activitiesCreated + 1) * 50,
        },
      })
    } catch (error) {
      if (connection) await connection.rollback()
      next(error)
    } finally {
      connection?.release()
    }
  },
)

app.get('/api/people/search', requireSession, async (request, response, next) => {
  const query = typeof request.query.q === 'string' ? request.query.q.trim() : ''
  if (query.length < 2 || query.length > 60) {
    return response.json({ people: [] })
  }

  try {
    const escapedQuery = query.replace(/[\\%_]/g, '\\$&')
    const [rows] = await pool.execute(
      `SELECT c.client_id, c.full_name, c.profile_city, c.profile_tagline,
              c.profile_bio, c.profile_tags, c.profile_photo_mime, c.spontii_score,
              f.friendship_id, f.requester_client_id, f.status AS friendship_status
       FROM clients c
       LEFT JOIN friendships f
         ON f.client_low_id = LEAST(c.client_id, ?)
        AND f.client_high_id = GREATEST(c.client_id, ?)
       WHERE c.client_id <> ? AND c.full_name LIKE ? ESCAPE '\\\\'
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_client_id = ? AND b.blocked_client_id = c.client_id)
              OR (b.blocker_client_id = c.client_id AND b.blocked_client_id = ?)
         )
       ORDER BY c.full_name ASC
       LIMIT 12`,
      [
        request.clientId,
        request.clientId,
        request.clientId,
        `%${escapedQuery}%`,
        request.clientId,
        request.clientId,
      ],
    )
    response.json({
      people: rows.map((row) => ({
        ...publicPerson(row),
        relationship: row.friendship_status === 'accepted'
          ? 'friends'
          : row.friendship_status === 'pending'
            ? Number(row.requester_client_id) === request.clientId ? 'outgoing' : 'incoming'
            : 'none',
        requestId: row.friendship_id ? String(row.friendship_id) : null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/friends', requireSession, async (request, response, next) => {
  try {
    const [friendRows] = await pool.execute(
      `SELECT c.client_id, c.full_name, c.profile_city, c.profile_tagline,
              c.profile_bio, c.profile_tags, c.profile_photo_mime, c.spontii_score
       FROM friendships f
       JOIN clients c ON c.client_id =
         IF(f.client_low_id = ?, f.client_high_id, f.client_low_id)
       WHERE (f.client_low_id = ? OR f.client_high_id = ?)
         AND f.status = 'accepted'
       ORDER BY f.updated_at DESC`,
      [request.clientId, request.clientId, request.clientId],
    )
    const [incomingRows] = await pool.execute(
      `SELECT f.friendship_id, f.created_at,
              c.client_id, c.full_name, c.profile_city, c.profile_tagline,
              c.profile_bio, c.profile_tags, c.profile_photo_mime, c.spontii_score
       FROM friendships f
       JOIN clients c ON c.client_id = f.requester_client_id
       WHERE f.recipient_client_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [request.clientId],
    )
    const [outgoingRows] = await pool.execute(
      `SELECT f.friendship_id, f.created_at,
              c.client_id, c.full_name, c.profile_city, c.profile_tagline,
              c.profile_bio, c.profile_tags, c.profile_photo_mime, c.spontii_score
       FROM friendships f
       JOIN clients c ON c.client_id = f.recipient_client_id
       WHERE f.requester_client_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [request.clientId],
    )
    response.json({
      friends: friendRows.map(publicPerson),
      incomingRequests: incomingRows.map((row) => ({
        ...publicPerson(row),
        requestId: String(row.friendship_id),
        createdAt: row.created_at,
      })),
      outgoingRequests: outgoingRows.map((row) => ({
        ...publicPerson(row),
        requestId: String(row.friendship_id),
        createdAt: row.created_at,
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/friends/:personId', requireSession, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.personId)) {
    return response.status(400).json({ message: 'Invalid friend.' })
  }
  if (Number(request.params.personId) === request.clientId) {
    return response.status(400).json({ message: 'You cannot remove yourself as a friend.' })
  }

  try {
    const [result] = await pool.execute(
      `DELETE FROM friendships
       WHERE client_low_id = LEAST(?, ?)
         AND client_high_id = GREATEST(?, ?)
         AND status = 'accepted'`,
      [
        request.clientId,
        request.params.personId,
        request.clientId,
        request.params.personId,
      ],
    )
    if (result.affectedRows !== 1) {
      return response.status(404).json({ message: 'Accepted friendship not found.' })
    }
    notifyInBackground(
      notifyDirectAccess(pool, request.clientId, Number(request.params.personId)),
      'update direct messages after unfriending',
    )
    response.json({ status: 'removed' })
  } catch (error) {
    next(error)
  }
})

app.get('/api/people/:id', requireSession, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ message: 'Invalid profile.' })
  }
  const personId = Number(request.params.id)
  if (personId === request.clientId) {
    return response.json({ person: null, isSelf: true })
  }
  try {
    const [rows] = await pool.execute(
      `SELECT client_id, full_name, profile_city, profile_tagline, profile_bio,
              profile_tags, profile_photo_mime, spontii_score
       FROM clients WHERE client_id = ? LIMIT 1`,
      [personId],
    )
    if (!rows[0]) return response.status(404).json({ message: 'Profile not found.' })
    const blocks = await blockStatus(pool, request.clientId, personId)
    if (blocks.byThem) return response.status(404).json({ message: 'Profile not found.' })
    const [relations] = await pool.execute(
      `SELECT friendship_id, requester_client_id, status FROM friendships
       WHERE client_low_id = LEAST(?, ?) AND client_high_id = GREATEST(?, ?)
       LIMIT 1`,
      [request.clientId, personId, request.clientId, personId],
    )
    const relation = relations[0]
    const rights = blocks.byMe
      ? { allowed: false }
      : await messagingRights(pool, request.clientId, personId)
    response.json({
      person: {
        ...publicPerson(rows[0]),
        relationship: relation?.status === 'accepted'
          ? 'friends'
          : relation?.status === 'pending'
            ? Number(relation.requester_client_id) === request.clientId ? 'outgoing' : 'incoming'
            : 'none',
        requestId: relation?.friendship_id ? String(relation.friendship_id) : null,
        blocked: blocks.byMe,
        canMessage: rights.allowed,
      },
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/people/:id/photo', requireSession, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).end()
  }
  try {
    const [rows] = await pool.execute(
      `SELECT profile_photo, profile_photo_mime
       FROM clients WHERE client_id = ? LIMIT 1`,
      [request.params.id],
    )
    const photo = rows[0]
    if (!photo?.profile_photo) return response.status(404).end()
    response.set('Content-Type', photo.profile_photo_mime)
    response.set('Cache-Control', 'private, no-store')
    response.send(photo.profile_photo)
  } catch (error) {
    next(error)
  }
})

app.post('/api/friends/requests/:personId', requireSession, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.personId)) {
    return response.status(400).json({ message: 'Invalid person.' })
  }
  const personId = Number(request.params.personId)
  if (personId === request.clientId) {
    return response.status(400).json({ message: 'You cannot send a friend request to yourself.' })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const lowId = Math.min(request.clientId, personId)
    const highId = Math.max(request.clientId, personId)
    const [peopleRows] = await connection.execute(
      'SELECT client_id FROM clients WHERE client_id IN (?, ?)',
      [request.clientId, personId],
    )
    if (peopleRows.length !== 2 || await isBlockedBetween(connection, request.clientId, personId)) {
      await connection.rollback()
      return response.status(404).json({ message: 'Person not found.' })
    }
    const [existingRows] = await connection.execute(
      `SELECT friendship_id, requester_client_id, status,
              updated_at > NOW() - INTERVAL 7 DAY AS reviewed_recently
       FROM friendships
       WHERE client_low_id = ? AND client_high_id = ? FOR UPDATE`,
      [lowId, highId],
    )
    if (existingRows[0]?.status === 'rejected' &&
        Number(existingRows[0].requester_client_id) === request.clientId &&
        existingRows[0].reviewed_recently) {
      await connection.rollback()
      return response.status(429).json({ message: 'You can send this person another request later.' })
    }
    if (existingRows[0]?.status === 'accepted') {
      await connection.rollback()
      return response.status(409).json({ message: 'You are already friends.' })
    }
    if (existingRows[0]?.status === 'pending') {
      await connection.rollback()
      return response.status(409).json({
        message: Number(existingRows[0].requester_client_id) === request.clientId
          ? 'Friend request already sent.'
          : 'This person already sent you a request.',
      })
    }
    let friendshipId
    if (existingRows[0]) {
      friendshipId = existingRows[0].friendship_id
      await connection.execute(
        `UPDATE friendships SET requester_client_id = ?, recipient_client_id = ?,
         status = 'pending', created_at = NOW() WHERE friendship_id = ?`,
        [request.clientId, personId, friendshipId],
      )
    } else {
      const [created] = await connection.execute(
        `INSERT INTO friendships
           (client_low_id, client_high_id, requester_client_id, recipient_client_id, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [lowId, highId, request.clientId, personId],
      )
      friendshipId = created.insertId
    }
    const [senderRows] = await connection.execute(
      'SELECT full_name FROM clients WHERE client_id = ? LIMIT 1',
      [request.clientId],
    )
    await connection.execute(
      `INSERT INTO notifications
         (client_id, type, title, message, route, dedupe_key)
       VALUES (?, 'friend_request', 'New friend request', ?, '/people?tab=requests', ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), message = VALUES(message),
         route = VALUES(route), read_at = NULL, dismissed_at = NULL, created_at = NOW()`,
      [
        personId,
        `${senderRows[0].full_name} wants to connect with you.`,
        `friend-request:${friendshipId}`,
      ],
    )
    await connection.commit()
    response.status(201).json({ relationship: 'outgoing' })
  } catch (error) {
    if (connection) await connection.rollback()
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({ message: 'A friend request is already active.' })
    }
    next(error)
  } finally {
    connection?.release()
  }
})

app.delete('/api/friends/requests/:requestId', requireSession, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.requestId)) {
    return response.status(400).json({ message: 'Invalid friend request.' })
  }
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT friendship_id, recipient_client_id FROM friendships
       WHERE friendship_id = ? AND requester_client_id = ? AND status = 'pending'
       FOR UPDATE`,
      [request.params.requestId, request.clientId],
    )
    if (!rows[0]) {
      await connection.rollback()
      return response.status(404).json({ message: 'Pending friend request not found.' })
    }
    await connection.execute(
      'DELETE FROM friendships WHERE friendship_id = ?',
      [rows[0].friendship_id],
    )
    await connection.execute(
      `UPDATE notifications SET dismissed_at = COALESCE(dismissed_at, NOW())
       WHERE client_id = ? AND dedupe_key = ?`,
      [rows[0].recipient_client_id, `friend-request:${rows[0].friendship_id}`],
    )
    await connection.commit()
    response.json({ status: 'cancelled' })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.patch('/api/friends/requests/:id/:action', requireSession, async (request, response, next) => {
  const { id, action } = request.params
  if (!/^\d+$/.test(id) || !['accept', 'reject'].includes(action)) {
    return response.status(400).json({ message: 'Invalid friend request action.' })
  }
  try {
    const status = action === 'accept' ? 'accepted' : 'rejected'
    const [result] = await pool.execute(
      `UPDATE friendships SET status = ?
       WHERE friendship_id = ? AND recipient_client_id = ? AND status = 'pending'`,
      [status, id, request.clientId],
    )
    if (result.affectedRows !== 1) {
      return response.status(404).json({ message: 'Friend request not found.' })
    }
    await pool.execute(
      `UPDATE notifications SET dismissed_at = COALESCE(dismissed_at, NOW())
       WHERE client_id = ? AND dedupe_key = ?`,
      [request.clientId, `friend-request:${id}`],
    )
    if (action === 'accept') {
      const [requestRows] = await pool.execute(
        'SELECT requester_client_id FROM friendships WHERE friendship_id = ?',
        [id],
      )
      await pool.execute(
        `INSERT INTO notifications
           (client_id, type, title, message, route, dedupe_key)
         VALUES (?, 'friend_accepted', 'Friend request accepted', ?, '/people', ?)
         ON DUPLICATE KEY UPDATE read_at = NULL, dismissed_at = NULL, created_at = NOW()`,
        [
          requestRows[0].requester_client_id,
          'Your friend request was accepted.',
          `friend-accepted:${id}`,
        ],
      )
      notifyInBackground(
        notifyDirectAccess(pool, request.clientId, Number(requestRows[0].requester_client_id)),
        'open direct messages for new friends',
      )
    }
    response.json({ status })
  } catch (error) {
    next(error)
  }
})

app.post('/api/activities/:id/requests', requireSession, async (request, response, next) => {
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [activities] = await connection.execute(
      `SELECT activity_id, public_id, host_client_id, title, visibility,
              join_request_cutoff_minutes, capacity, status,
              starts_at <= DATE_ADD(UTC_TIMESTAMP(), INTERVAL join_request_cutoff_minutes MINUTE) AS requests_closed
       FROM activities WHERE public_id = ? FOR UPDATE`,
      [request.params.id],
    )
    const activity = activities[0]
    if (!activity || activity.status !== 'active') {
      await connection.rollback()
      return response.status(404).json({ message: 'Event not found or already ended.' })
    }
    if (Number(activity.host_client_id) === request.clientId) {
      await connection.rollback()
      return response.status(409).json({ message: "You can't request to join your own event." })
    }
    if (activity.visibility === 'private') {
      await connection.rollback()
      return response.status(404).json({ message: 'Event not found.' })
    }
    if (activity.visibility === 'friends') {
      const [friendship] = await connection.execute(
        `SELECT friendship_id FROM friendships
         WHERE status = 'accepted'
           AND ((client_low_id = ? AND client_high_id = ?)
             OR (client_low_id = ? AND client_high_id = ?))
         LIMIT 1`,
        [activity.host_client_id, request.clientId, request.clientId, activity.host_client_id],
      )
      if (!friendship[0]) {
        await connection.rollback()
        return response.status(404).json({ message: 'Event not found.' })
      }
    }
    if (activity.requests_closed) {
      await connection.rollback()
      return response.status(409).json({ message: 'Join requests for this event are closed.' })
    }
    const [approved] = await connection.execute(
      `SELECT COUNT(*) AS total FROM activity_join_requests
       WHERE activity_id = ? AND status = 'approved'`,
      [activity.activity_id],
    )
    if (Number(approved[0].total) + 1 >= Number(activity.capacity)) {
      await connection.rollback()
      return response.status(409).json({ message: 'This event is full.' })
    }
    const [prior] = await connection.execute(
      `SELECT request_id, status FROM activity_join_requests
       WHERE activity_id = ? AND applicant_client_id = ? FOR UPDATE`,
      [activity.activity_id, request.clientId],
    )
    if (prior[0]?.status === 'pending') {
      await connection.commit()
      return response.json({ request: { id: String(prior[0].request_id), status: 'pending' }, created: false })
    }
    if (prior[0]?.status === 'approved') {
      await connection.rollback()
      return response.status(409).json({ message: "You're already approved for this event." })
    }
    if (prior[0]?.status === 'removed') {
      await connection.rollback()
      return response.status(403).json({ message: 'The host removed you from this event.' })
    }
    if (prior[0]) {
      await connection.execute(
        `UPDATE activity_join_requests SET status = 'pending', created_at = NOW(), reviewed_at = NULL
         WHERE request_id = ?`,
        [prior[0].request_id],
      )
    } else {
      await connection.execute(
        `INSERT INTO activity_join_requests (activity_id, applicant_client_id)
         VALUES (?, ?)`,
        [activity.activity_id, request.clientId],
      )
    }
    await connection.execute(
      `INSERT INTO notifications
         (client_id, type, title, message, route, dedupe_key)
       VALUES (?, 'event_join_request', 'New event request', ?, ?, ?)
       ON DUPLICATE KEY UPDATE read_at = NULL, dismissed_at = NULL, created_at = NOW()`,
      [
        activity.host_client_id,
        `Someone requested to join ${activity.title}.`,
        `/activities/${activity.public_id}`,
        `event-join-request:${activity.public_id}:${request.clientId}`,
      ],
    )
    const [current] = await connection.execute(
      `SELECT request_id FROM activity_join_requests
       WHERE activity_id = ? AND applicant_client_id = ?`,
      [activity.activity_id, request.clientId],
    )
    await connection.commit()
    response.status(prior[0] ? 200 : 201).json({
      request: { id: String(current[0].request_id), status: 'pending' },
      created: true,
    })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.get('/api/activities/:id/requests', requireSession, async (request, response, next) => {
  try {
    const [activities] = await pool.execute(
      `SELECT activity_id FROM activities
       WHERE public_id = ? AND host_client_id = ? AND status = 'active' LIMIT 1`,
      [request.params.id, request.clientId],
    )
    if (!activities[0]) return response.status(404).json({ message: 'Hosted event not found.' })
    const [rows] = await pool.execute(
      `SELECT jr.request_id, jr.status, jr.created_at,
              c.client_id, c.full_name, c.profile_city, c.profile_tagline,
              c.profile_bio, c.profile_tags, c.profile_photo_mime, c.spontii_score
       FROM activity_join_requests jr
       JOIN clients c ON c.client_id = jr.applicant_client_id
       WHERE jr.activity_id = ? AND jr.status = 'pending'
       ORDER BY jr.created_at ASC`,
      [activities[0].activity_id],
    )
    response.json({ requests: rows.map((row) => ({
      id: String(row.request_id),
      status: row.status,
      requestedAt: row.created_at,
      applicant: {
        id: Number(row.client_id),
        name: row.full_name,
        city: row.profile_city || '',
        tagline: row.profile_tagline || '',
        bio: row.profile_bio || '',
        tags: typeof row.profile_tags === 'string' ? JSON.parse(row.profile_tags || '[]') : row.profile_tags || [],
        verified: Boolean(row.profile_photo_mime),
        score: Number(row.spontii_score || 0),
      },
    })) })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/activities/:id/requests/:requestId', requireSession, async (request, response, next) => {
  const action = request.body?.action
  if (!['approve', 'reject'].includes(action)) {
    return response.status(400).json({ message: 'Choose approve or reject.' })
  }
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT a.activity_id, a.host_client_id, a.capacity, a.title,
              jr.request_id, jr.applicant_client_id, jr.status
       FROM activities a
       JOIN activity_join_requests jr ON jr.activity_id = a.activity_id
       WHERE a.public_id = ? AND jr.request_id = ?
       FOR UPDATE`,
      [request.params.id, request.params.requestId],
    )
    const item = rows[0]
    if (!item || Number(item.host_client_id) !== request.clientId) {
      await connection.rollback()
      return response.status(404).json({ message: 'Request not found.' })
    }
    if (item.status !== 'pending') {
      await connection.rollback()
      return response.status(409).json({ message: 'This request has already been reviewed.' })
    }
    if (action === 'approve') {
      const [count] = await connection.execute(
        `SELECT COUNT(*) AS total FROM activity_join_requests
         WHERE activity_id = ? AND status = 'approved'`,
        [item.activity_id],
      )
      if (Number(count[0].total) + 1 >= Number(item.capacity)) {
        await connection.rollback()
        return response.status(409).json({ message: 'This event is full.' })
      }
    }
    await connection.execute(
      `UPDATE activity_join_requests SET status = ?, reviewed_at = NOW()
       WHERE request_id = ?`,
      [action === 'approve' ? 'approved' : 'rejected', item.request_id],
    )
    await connection.execute(
      `INSERT INTO notifications
         (client_id, type, title, message, route, dedupe_key)
       VALUES (?, 'event_join_review', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE read_at = NULL, dismissed_at = NULL, created_at = NOW()`,
      [
        item.applicant_client_id,
        action === 'approve' ? 'You’re in!' : 'Event request update',
        action === 'approve' ? `The host approved your request for ${item.title}.` : `The host declined your request for ${item.title}.`,
        `/activities/${request.params.id}`,
        `event-join-review:${request.params.id}:${item.applicant_client_id}`,
      ],
    )
    await connection.commit()
    response.json({ status: action === 'approve' ? 'approved' : 'rejected' })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.get('/api/activities/:id/attendees', requireSession, async (request, response, next) => {
  try {
    const [activities] = await pool.execute(
      `SELECT a.activity_id, a.host_client_id,
         EXISTS(SELECT 1 FROM activity_join_requests jr
                WHERE jr.activity_id = a.activity_id
                  AND jr.applicant_client_id = ? AND jr.status = 'approved') AS is_attendee
       FROM activities a WHERE a.public_id = ? AND a.status = 'active' LIMIT 1`,
      [request.clientId, request.params.id],
    )
    const activity = activities[0]
    if (!activity) return response.status(404).json({ message: 'Event not found.' })
    if (Number(activity.host_client_id) !== request.clientId && !activity.is_attendee) {
      return response.status(403).json({ message: 'Only the host and approved attendees can view attendee profiles.' })
    }
    const [rows] = await pool.execute(
      `SELECT c.client_id, c.full_name, c.profile_city, c.profile_tagline,
              c.profile_bio, c.profile_tags, c.profile_photo_mime, c.spontii_score
       FROM activity_join_requests jr
       JOIN clients c ON c.client_id = jr.applicant_client_id
       WHERE jr.activity_id = ? AND jr.status = 'approved'
       ORDER BY jr.reviewed_at ASC`,
      [activity.activity_id],
    )
    const [hosts] = await pool.execute(
      `SELECT client_id, full_name, profile_city, profile_tagline, profile_bio,
              profile_tags, profile_photo_mime, spontii_score
       FROM clients WHERE client_id = ?`,
      [activity.host_client_id],
    )
    const profile = (row) => ({
      id: Number(row.client_id),
      name: row.full_name,
      city: row.profile_city || '',
      tagline: row.profile_tagline || '',
      bio: row.profile_bio || '',
      tags: typeof row.profile_tags === 'string' ? JSON.parse(row.profile_tags || '[]') : row.profile_tags || [],
      verified: Boolean(row.profile_photo_mime),
      score: Number(row.spontii_score || 0),
    })
    response.json({ attendees: [profile(hosts[0]), ...rows.map(profile)] })
  } catch (error) {
    next(error)
  }
})

registerChatRoutes(app, { pool, requireSession })

app.patch('/api/activities/:id/complete', requireSession, async (request, response, next) => {
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT activity_id, host_client_id, status
       FROM activities WHERE public_id = ? LIMIT 1`,
      [request.params.id],
    )
    const activity = rows[0]
    if (!activity) {
      await connection.rollback()
      return response.status(404).json({ message: 'Event not found or already ended.' })
    }
    if (Number(activity.host_client_id) !== request.clientId) {
      await connection.rollback()
      return response.status(403).json({ message: 'Only the event host can complete this event.' })
    }
    if (activity.status !== 'active') {
      await connection.rollback()
      return response.status(409).json({ message: 'This event has already been completed.' })
    }

    await connection.execute(
      `UPDATE activities SET status = 'completed' WHERE activity_id = ?`,
      [activity.activity_id],
    )
    const [notifications] = await connection.execute(
      `SELECT notification_id FROM notifications
       WHERE client_id = ? AND type = 'hosted_event'
         AND dedupe_key = ? AND dismissed_at IS NULL
       LIMIT 1`,
      [request.clientId, `hosted-event:${request.params.id}`],
    )
    await connection.execute(
      `UPDATE notifications SET dismissed_at = NOW()
       WHERE client_id = ? AND type = 'hosted_event'
         AND dedupe_key = ? AND dismissed_at IS NULL`,
      [request.clientId, `hosted-event:${request.params.id}`],
    )
    await connection.commit()
    notifyInBackground(
      notifyEventClosed(pool, activity.activity_id, request.params.id, request.clientId),
      'close chats for a completed event',
    )
    response.json({
      message: 'Event completed.',
      notificationId: notifications[0] ? String(notifications[0].notification_id) : null,
    })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.get('/api/activities/:id/media/:mediaId', optionalSession, async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT m.mime_type, m.media_data, a.visibility, a.host_client_id
       FROM activity_media m
       JOIN activities a ON a.activity_id = m.activity_id
       WHERE a.public_id = ? AND m.media_id = ?
         AND a.ends_at > UTC_TIMESTAMP()
         AND (
           a.visibility = 'public' OR a.host_client_id = ?
           OR EXISTS (
             SELECT 1 FROM activity_join_requests jr
             WHERE jr.activity_id = a.activity_id
               AND jr.applicant_client_id = ? AND jr.status = 'approved'
           )
         )
       LIMIT 1`,
      [request.params.id, request.params.mediaId, request.clientId || 0, request.clientId || 0],
    )
    if (!rows[0]) return response.status(404).json({ message: 'Event media not found.' })
    response.set('Content-Type', rows[0].mime_type)
    response.set('X-Content-Type-Options', 'nosniff')
    response.set('Cache-Control', 'private, no-store')
    response.send(rows[0].media_data)
  } catch (error) {
    next(error)
  }
})

app.post('/api/notifications/profile-reminder-shown', requireSession, async (request, response, next) => {
  const { displayId } = request.body || {}
  if (
    typeof displayId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(displayId)
  ) {
    return response.status(400).json({ message: 'Invalid profile reminder display.' })
  }

  try {
    const [clients] = await pool.execute(
      `SELECT full_name, profile_city, profile_tagline, profile_bio,
              profile_tags, profile_photo_mime
       FROM clients WHERE client_id = ? LIMIT 1`,
      [request.clientId],
    )
    const client = clients[0]
    if (!client) {
      return response.status(401).json({ message: 'Account not found.' })
    }

    const completion = calculateProfileCompletion(client)
    if (completion >= 100) {
      return response.status(204).end()
    }

    const dedupeKey = `profile-reminder-shown:${displayId}`
    await pool.execute(
      `INSERT IGNORE INTO notifications
         (client_id, type, title, message, route, dedupe_key)
       VALUES (?, 'profile_completion', 'Complete your Spontii profile', ?, '/profile', ?)`,
      [
        request.clientId,
        `Your profile is ${completion}% complete. Add a few details so people can get to know you.`,
        dedupeKey,
      ],
    )

    const [rows] = await pool.execute(
      `SELECT notification_id, type, title, message, route, read_at, created_at
       FROM notifications
       WHERE client_id = ? AND dedupe_key = ? LIMIT 1`,
      [request.clientId, dedupeKey],
    )
    const notification = rows[0]
    response.status(201).json({
      notification: {
        id: String(notification.notification_id),
        type: notification.type,
        title: notification.title,
        message: notification.message,
        route: notification.route,
        readAt: notification.read_at,
        createdAt: notification.created_at,
      },
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/notifications', requireSession, async (request, response, next) => {
  try {
    await expireActivities()
    const [clients] = await pool.execute(
      `SELECT full_name, profile_city, profile_tagline, profile_bio,
              profile_tags, profile_photo_mime,
              DATE_FORMAT(last_daily_points_claim_date, '%Y-%m-%d') AS last_daily_points_claim_date,
              DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS today
       FROM clients WHERE client_id = ? LIMIT 1`,
      [request.clientId],
    )
    const client = clients[0]
    if (!client) {
      return response.status(401).json({ message: 'Account not found.' })
    }

    const completion = calculateProfileCompletion(client)
    const firstName = client.full_name.trim().split(/\s+/)[0] || 'there'
    const hour = new Date().getHours()
    const greeting = hour < 12
      ? 'Good morning'
      : hour < 17
        ? 'Good afternoon'
        : 'Good evening'
    const dayKey = client.today
    const createdIds = []

    const [greetingResult] = await pool.execute(
      `INSERT IGNORE INTO notifications
         (client_id, type, title, message, route, dedupe_key)
       VALUES (?, 'greeting', ?, ?, NULL, ?)`,
      [
        request.clientId,
        `${greeting}, ${firstName}!`,
        'Hope your day brings a great plan and good company.',
        `daily-greeting:${dayKey}`,
      ],
    )
    if (greetingResult.affectedRows === 1) {
      createdIds.push(String(greetingResult.insertId))
    }

    if (
      !client.last_daily_points_claim_date ||
      String(client.last_daily_points_claim_date).slice(0, 10) !== dayKey
    ) {
      await pool.execute(
        `UPDATE notifications SET dismissed_at = NOW()
         WHERE client_id = ? AND type = 'daily_points_claim'
           AND dedupe_key <> ? AND dismissed_at IS NULL`,
        [request.clientId, `daily-points:${dayKey}`],
      )
      const [claimResult] = await pool.execute(
        `INSERT IGNORE INTO notifications
           (client_id, type, title, message, route, dedupe_key)
         VALUES (?, 'daily_points_claim', 'Your daily Spontii points are ready',
                 'Claim 20 Spontii points today. You can claim once per day.', NULL, ?)`,
        [request.clientId, `daily-points:${dayKey}`],
      )
      if (claimResult.affectedRows === 1) {
        createdIds.push(String(claimResult.insertId))
      }
    }

    const [rows] = await pool.execute(
      `SELECT notification_id, type, title, message, route, read_at, created_at
       FROM notifications
       WHERE client_id = ? AND dismissed_at IS NULL
         AND (type <> 'profile_completion' OR ? < 100)
       ORDER BY created_at DESC, notification_id DESC
       LIMIT 50`,
      [request.clientId, completion],
    )

    response.json({
      notifications: rows.map((row) => ({
        id: String(row.notification_id),
        type: row.type,
        title: row.title,
        message: row.message,
        route: row.route,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
      createdIds,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/points', requireSession, async (request, response, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT spontii_points, lifetime_activities_created,
              DATE_FORMAT(last_daily_points_claim_date, '%Y-%m-%d') AS lastClaimDate,
              DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS today
       FROM clients WHERE client_id = ? LIMIT 1`,
      [request.clientId],
    )
    if (!rows[0]) {
      return response.status(401).json({ message: 'Account not found.' })
    }
    const activitiesCreated = Number(rows[0].lifetime_activities_created)
    response.json({
      balance: Number(rows[0].spontii_points),
      activitiesCreated,
      nextActivityCost: 100 + activitiesCreated * 50,
      dailyClaimAvailable: rows[0].lastClaimDate !== rows[0].today,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/points/daily-claim', requireSession, async (request, response, next) => {
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()
    const [rows] = await connection.execute(
      `SELECT spontii_points,
              DATE_FORMAT(last_daily_points_claim_date, '%Y-%m-%d') AS lastClaimDate,
              DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS today
       FROM clients WHERE client_id = ? FOR UPDATE`,
      [request.clientId],
    )
    if (!rows[0]) {
      await connection.rollback()
      return response.status(401).json({ message: 'Account not found.' })
    }
    if (rows[0].lastClaimDate === rows[0].today) {
      await connection.rollback()
      return response.status(409).json({ message: 'You have already claimed today’s Spontii points.' })
    }

    const [updateResult] = await connection.execute(
      `UPDATE clients
       SET spontii_points = spontii_points + 20,
           last_daily_points_claim_date = CURRENT_DATE()
       WHERE client_id = ?`,
      [request.clientId],
    )
    if (updateResult.affectedRows !== 1) {
      throw new Error('Could not claim daily Spontii points.')
    }
    await connection.execute(
      `UPDATE notifications SET dismissed_at = NOW(), read_at = COALESCE(read_at, NOW())
       WHERE client_id = ? AND type = 'daily_points_claim'
         AND dedupe_key = CONCAT('daily-points:', DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d'))
         AND dismissed_at IS NULL`,
      [request.clientId],
    )
    await connection.commit()
    response.json({
      awarded: 20,
      balance: Number(rows[0].spontii_points) + 20,
      message: '20 Spontii points added to your balance.',
    })
  } catch (error) {
    if (connection) await connection.rollback()
    next(error)
  } finally {
    connection?.release()
  }
})

app.patch('/api/notifications/:id/read', requireSession, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ message: 'Invalid notification.' })
  }

  try {
    const [result] = await pool.execute(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE notification_id = ? AND client_id = ? AND dismissed_at IS NULL`,
      [request.params.id, request.clientId],
    )
    if (result.affectedRows !== 1) {
      return response.status(404).json({ message: 'Notification not found.' })
    }
    response.json({ message: 'Notification opened.' })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/notifications/:id', requireSession, async (request, response, next) => {
  if (!/^\d+$/.test(request.params.id)) {
    return response.status(400).json({ message: 'Invalid notification.' })
  }

  try {
    const [notifications] = await pool.execute(
      `SELECT type FROM notifications
       WHERE notification_id = ? AND client_id = ? AND dismissed_at IS NULL
       LIMIT 1`,
      [request.params.id, request.clientId],
    )
    if (!notifications[0]) {
      return response.status(404).json({ message: 'Notification not found.' })
    }
    if (['hosted_event', 'daily_points_claim'].includes(notifications[0].type)) {
      return response.status(403).json({
        message: notifications[0].type === 'hosted_event'
          ? 'Complete the hosted event to remove its notification.'
          : 'Claim your daily Spontii points from this notification.',
      })
    }
    const [result] = await pool.execute(
      `UPDATE notifications SET dismissed_at = NOW()
       WHERE notification_id = ? AND client_id = ? AND dismissed_at IS NULL`,
      [request.params.id, request.clientId],
    )
    if (result.affectedRows !== 1) {
      return response.status(404).json({ message: 'Notification not found.' })
    }
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

const OTP_TTL_MINUTES = 3
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_SECONDS = 30
const EMAIL_VERIFICATION_TOKEN_TTL = '30m'

function hashOtp(email, otp) {
  return createHmac('sha256', jwtSecret).update(`${email}:${otp}`).digest('hex')
}

async function issueOtp(email) {
  const otp = String(randomInt(0, 1000000)).padStart(6, '0')
  await pool.execute(
    `INSERT INTO email_verifications
       (email, otp_hash, otp_expires_at, attempts, last_sent_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 0, NOW())
     ON DUPLICATE KEY UPDATE
       otp_hash = VALUES(otp_hash),
       otp_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
       attempts = 0,
       last_sent_at = NOW()`,
    [email, hashOtp(email, otp), OTP_TTL_MINUTES, OTP_TTL_MINUTES],
  )
  return otp
}

async function issueLoginOtp(email) {
  const otp = String(randomInt(0, 1000000)).padStart(6, '0')
  await pool.execute(
    `INSERT INTO login_otps
       (email, otp_hash, otp_expires_at, attempts, last_sent_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 0, NOW())
     ON DUPLICATE KEY UPDATE
       otp_hash = VALUES(otp_hash),
       otp_expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE),
       attempts = 0,
       last_sent_at = NOW()`,
    [email, hashOtp(email, otp), OTP_TTL_MINUTES, OTP_TTL_MINUTES],
  )
  return otp
}

app.post('/api/auth/signup', authLimiter, async (request, response, next) => {
  const validation = validateSignup(request.body)

  if (validation.message) {
    return response.status(400).json({ message: validation.message })
  }

  try {
    const { name, phone, email, password } = validation.value
    const verificationToken = typeof request.body?.emailVerificationToken === 'string'
      ? request.body.emailVerificationToken
      : ''
    let verifiedEmail

    try {
      const payload = jwt.verify(verificationToken, jwtSecret)
      if (payload.purpose !== 'signup_email_verified' || payload.email !== email) {
        throw new Error('Email verification does not match.')
      }
      verifiedEmail = payload.email
    } catch {
      return response.status(403).json({
        message: 'Verify your email before creating your account.',
      })
    }

    const [existing] = await pool.execute(
      'SELECT client_id FROM clients WHERE email = ? OR phone_number = ? LIMIT 1',
      [verifiedEmail, phone],
    )
    if (existing.length > 0) {
      return response.status(409).json({
        message: 'An account with this email or phone number already exists.',
      })
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const spontiiiId = `SPONTIII-${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
    await pool.execute(
      `INSERT INTO clients
         (full_name, phone_number, email, password_hash, spontiii_id, spontii_score)
       VALUES (?, ?, ?, ?, ?, 20)`,
      [name, phone, verifiedEmail, passwordHash, spontiiiId],
    )

    response.clearCookie(cookieName, cookieOptions)
    response.status(201).json({ message: 'Account created. Please log in to continue.' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return response.status(409).json({
        message: 'An account with this email or phone number already exists.',
      })
    }
    next(error)
  }
})

app.post('/api/auth/send-verification-code', authLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response.status(400).json({ message: 'Enter a valid email address.' })
  }

  try {
    const [existing] = await pool.execute(
      'SELECT client_id FROM clients WHERE email = ? LIMIT 1',
      [email],
    )
    if (existing.length) {
      return response.status(409).json({ message: 'An account with this email already exists.' })
    }

    const [previousCodes] = await pool.execute(
      `SELECT TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS since_last
       FROM email_verifications WHERE email = ? LIMIT 1`,
      [email],
    )
    if (previousCodes[0]?.since_last < OTP_RESEND_SECONDS) {
      return response.status(429).json({
        message: `Please wait ${OTP_RESEND_SECONDS - previousCodes[0].since_last}s before requesting another code.`,
      })
    }

    const otp = await issueOtp(email)

    try {
      await sendOtpEmail({ to: email, name: 'there', otp, minutes: OTP_TTL_MINUTES })
    } catch (mailError) {
      console.error('Failed to send verification email:', mailError.message)
      await pool.execute('DELETE FROM email_verifications WHERE email = ?', [email])
      return response.status(502).json({
        message: 'We could not send the verification email. Check the address and try again.',
      })
    }

    response.json({
      message: 'We sent a 6-digit code to your email.',
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      resendInSeconds: OTP_RESEND_SECONDS,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/verify-email', authLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const otp = typeof request.body?.otp === 'string' ? request.body.otp.trim() : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(otp)) {
    return response.status(400).json({ message: 'Enter a valid email and the 6-digit code.' })
  }

  try {
    const [rows] = await pool.execute(
      'SELECT *, otp_expires_at <= NOW() AS expired FROM email_verifications WHERE email = ? LIMIT 1',
      [email],
    )
    const verification = rows[0]

    if (!verification) {
      return response.status(404).json({ message: 'Request a verification code first.' })
    }
    if (verification.expired) {
      return response.status(410).json({ message: 'This code has expired. Request a new one.' })
    }
    if (verification.attempts >= OTP_MAX_ATTEMPTS) {
      return response.status(429).json({ message: 'Too many wrong attempts. Request a new code.' })
    }

    const expected = Buffer.from(verification.otp_hash)
    const given = Buffer.from(hashOtp(email, otp))
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await pool.execute('UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?', [email])
      return response.status(400).json({ message: 'Incorrect code. Please try again.' })
    }

    const [deleteResult] = await pool.execute(
      'DELETE FROM email_verifications WHERE email = ? AND otp_hash = ? AND otp_expires_at > NOW()',
      [email, verification.otp_hash],
    )
    if (deleteResult.affectedRows !== 1) {
      return response.status(410).json({ message: 'This code has expired or was already used. Request a new one.' })
    }

    const emailVerificationToken = jwt.sign(
      { email, purpose: 'signup_email_verified' },
      jwtSecret,
      { expiresIn: EMAIL_VERIFICATION_TOKEN_TTL },
    )
    response.json({
      message: 'Email verified.',
      emailVerificationToken,
      expiresInMinutes: 30,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/resend-otp', authLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response.status(400).json({ message: 'Enter a valid email address.' })
  }

  try {
    const [rows] = await pool.execute(
      `SELECT TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS since_last
       FROM email_verifications WHERE email = ? LIMIT 1`,
      [email],
    )
    const verification = rows[0]

    if (!verification) {
      return response.status(404).json({ message: 'Request a verification code first.' })
    }
    if (verification.since_last < OTP_RESEND_SECONDS) {
      return response.status(429).json({
        message: `Please wait ${OTP_RESEND_SECONDS - verification.since_last}s before requesting another code.`,
      })
    }

    const otp = await issueOtp(email)
    try {
      await sendOtpEmail({ to: email, name: 'there', otp, minutes: OTP_TTL_MINUTES })
    } catch (mailError) {
      console.error('Failed to resend verification email:', mailError.message)
      return response.status(502).json({ message: 'We could not send the email. Please try again.' })
    }

    response.json({
      message: 'A new code has been sent.',
      expiresInSeconds: OTP_TTL_MINUTES * 60,
      resendInSeconds: OTP_RESEND_SECONDS,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/send-login-code', authLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const genericResponse = {
    message: 'If an account exists for that email, we’ll send a login code.',
    expiresInSeconds: OTP_TTL_MINUTES * 60,
    resendInSeconds: OTP_RESEND_SECONDS,
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return response.status(400).json({ message: 'Enter a valid email address.' })
  }

  try {
    const [clients] = await pool.execute(
      'SELECT full_name FROM clients WHERE email = ? LIMIT 1',
      [email],
    )
    const client = clients[0]
    if (!client) {
      return response.json(genericResponse)
    }

    const [previousCodes] = await pool.execute(
      `SELECT TIMESTAMPDIFF(SECOND, last_sent_at, NOW()) AS since_last
       FROM login_otps WHERE email = ? LIMIT 1`,
      [email],
    )
    if (previousCodes[0]?.since_last < OTP_RESEND_SECONDS) {
      return response.json(genericResponse)
    }

    const otp = await issueLoginOtp(email)
    try {
      await sendOtpEmail({
        to: email,
        name: client.full_name,
        otp,
        minutes: OTP_TTL_MINUTES,
        purpose: 'login',
      })
    } catch (mailError) {
      console.error('Failed to send login code email:', mailError.message)
      await pool.execute('DELETE FROM login_otps WHERE email = ?', [email])
      return response.status(502).json({
        message: 'We could not send the login code. Please try again later.',
      })
    }

    response.json(genericResponse)
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login-with-code', authLimiter, async (request, response, next) => {
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : ''
  const otp = typeof request.body?.otp === 'string' ? request.body.otp.trim() : ''
  const invalidCode = () => response.status(400).json({
    message: 'The login code is invalid or expired. Request a new code and try again.',
  })

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !/^\d{6}$/.test(otp)) {
    return response.status(400).json({ message: 'Enter a valid email and the 6-digit code.' })
  }

  try {
    const [rows] = await pool.execute(
      'SELECT *, otp_expires_at <= NOW() AS expired FROM login_otps WHERE email = ? LIMIT 1',
      [email],
    )
    const loginCode = rows[0]
    if (!loginCode || loginCode.expired) {
      return invalidCode()
    }
    if (loginCode.attempts >= OTP_MAX_ATTEMPTS) {
      return response.status(429).json({ message: 'Too many wrong attempts. Request a new login code.' })
    }

    const expected = Buffer.from(loginCode.otp_hash)
    const given = Buffer.from(hashOtp(email, otp))
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await pool.execute(
        'UPDATE login_otps SET attempts = attempts + 1 WHERE email = ? AND otp_hash = ? AND otp_expires_at > NOW()',
        [email, loginCode.otp_hash],
      )
      return invalidCode()
    }

    const [clients] = await pool.execute(
      'SELECT client_id FROM clients WHERE email = ? LIMIT 1',
      [email],
    )
    const client = clients[0]
    if (!client) {
      await pool.execute('DELETE FROM login_otps WHERE email = ?', [email])
      return invalidCode()
    }

    const [deleteResult] = await pool.execute(
      'DELETE FROM login_otps WHERE email = ? AND otp_hash = ? AND otp_expires_at > NOW()',
      [email, loginCode.otp_hash],
    )
    if (deleteResult.affectedRows !== 1) {
      return invalidCode()
    }

    const [profileRows] = await selectProfile(client.client_id)
    if (!profileRows[0]) {
      return invalidCode()
    }

    setSessionCookie(response, client.client_id)
    response.json({ user: publicUser(profileRows[0]) })
  } catch (error) {
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
        ? 'Uploaded files must be 12 MB or smaller.'
        : 'Could not process the uploaded files.',
    })
  }
  if (error.message === 'Upload JPG, PNG, WebP, MP4, WebM, or MOV files only.') {
    return response.status(400).json({ message: error.message })
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

  await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        email VARCHAR(254) NOT NULL,
        otp_hash VARCHAR(64) NOT NULL,
        otp_expires_at DATETIME NOT NULL,
        attempts INT UNSIGNED NOT NULL DEFAULT 0,
        last_sent_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (email)
      ) ENGINE=InnoDB
        DEFAULT CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
  `)

  await pool.query(`
      CREATE TABLE IF NOT EXISTS login_otps (
        email VARCHAR(254) NOT NULL,
        otp_hash VARCHAR(64) NOT NULL,
        otp_expires_at DATETIME NOT NULL,
        attempts INT UNSIGNED NOT NULL DEFAULT 0,
        last_sent_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (email)
      ) ENGINE=InnoDB
        DEFAULT CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
  `)

  await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        client_id BIGINT UNSIGNED NOT NULL,
        type VARCHAR(40) NOT NULL,
        title VARCHAR(120) NOT NULL,
        message VARCHAR(500) NOT NULL,
        route VARCHAR(255) NULL,
        dedupe_key VARCHAR(100) NULL,
        read_at DATETIME NULL,
        dismissed_at DATETIME NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (notification_id),
        UNIQUE KEY uq_notifications_client_dedupe (client_id, dedupe_key),
        KEY idx_notifications_client_active (client_id, dismissed_at, created_at),
        CONSTRAINT fk_notifications_client
          FOREIGN KEY (client_id) REFERENCES clients (client_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
        DEFAULT CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activities (
        activity_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        public_id CHAR(36) NOT NULL,
        host_client_id BIGINT UNSIGNED NOT NULL,
        title VARCHAR(120) NOT NULL,
        category VARCHAR(80) NOT NULL,
        description VARCHAR(5000) NOT NULL,
        visibility ENUM('public', 'friends', 'private') NOT NULL DEFAULT 'public',
        vibe VARCHAR(60) NOT NULL DEFAULT 'Social',
        city VARCHAR(80) NOT NULL,
        state VARCHAR(80) NOT NULL DEFAULT '',
        area VARCHAR(160) NOT NULL,
        venue_name VARCHAR(160) NULL,
        venue_address VARCHAR(300) NULL,
        latitude DECIMAL(10, 7) NULL,
        landmark VARCHAR(200) NULL,
        longitude DECIMAL(10, 7) NULL,
        starts_at DATETIME NOT NULL,
        ends_at DATETIME NOT NULL,
        join_request_cutoff_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15,
        capacity SMALLINT UNSIGNED NOT NULL,
        food_available BOOLEAN NOT NULL DEFAULT FALSE,
        food_preference ENUM('any', 'vegetarian', 'non-vegetarian', 'both') NULL,
        beverages_available BOOLEAN NOT NULL DEFAULT FALSE,
        drinks_available BOOLEAN NOT NULL DEFAULT FALSE,
        attendee_preference VARCHAR(80) NOT NULL DEFAULT 'Anyone',
        experience_level VARCHAR(80) NOT NULL DEFAULT 'Any experience',
        preferences JSON NULL,
        event_tags JSON NULL,
        banner_image VARCHAR(1000) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (activity_id),
        UNIQUE KEY uq_activities_public_id (public_id),
        KEY idx_activities_active (visibility, ends_at, starts_at),
        KEY idx_activities_host (host_client_id, ends_at),
        CONSTRAINT fk_activities_host
          FOREIGN KEY (host_client_id) REFERENCES clients (client_id)
          ON DELETE CASCADE
    ) ENGINE=InnoDB
        DEFAULT CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
  `)
  const [activityColumns] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities'`,
  )
  const activityColumnNames = new Set(activityColumns.map((column) => column.COLUMN_NAME))
  const activityColumnMigrations = [
    ['attendee_preference', "VARCHAR(80) NOT NULL DEFAULT 'Anyone'"],
    ['experience_level', "VARCHAR(80) NOT NULL DEFAULT 'Any experience'"],
    ['preferences', 'JSON NULL'],
    ['event_tags', 'JSON NULL'],
    ['status', "VARCHAR(20) NOT NULL DEFAULT 'active'"],
    ['state', "VARCHAR(80) NOT NULL DEFAULT ''"],
    ['join_request_cutoff_minutes', 'SMALLINT UNSIGNED NOT NULL DEFAULT 15'],
  ]
  for (const [columnName, definition] of activityColumnMigrations) {
    if (!activityColumnNames.has(columnName)) {
        await pool.query(`ALTER TABLE activities ADD COLUMN ${columnName} ${definition}`)
    }
    const [visibilityColumn] = await pool.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activities'
         AND COLUMN_NAME = 'visibility' LIMIT 1`,
    )
    if (visibilityColumn[0] && !visibilityColumn[0].COLUMN_TYPE.includes("'friends'")) {
      await pool.query(
        "ALTER TABLE activities MODIFY COLUMN visibility ENUM('public', 'friends', 'private') NOT NULL DEFAULT 'public'",
      )
    }
    await pool.execute(
      `UPDATE activities
       SET state = CASE
         WHEN LOWER(city) IN ('mumbai', 'pune') THEN 'Maharashtra'
         WHEN LOWER(city) = 'bengaluru' THEN 'Karnataka'
         WHEN LOWER(city) = 'delhi' THEN 'Delhi'
         WHEN LOWER(city) = 'hyderabad' THEN 'Telangana'
         ELSE state
       END
       WHERE state = ''`,
    )

    await pool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        friendship_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        client_low_id BIGINT UNSIGNED NOT NULL,
        client_high_id BIGINT UNSIGNED NOT NULL,
        requester_client_id BIGINT UNSIGNED NOT NULL,
        recipient_client_id BIGINT UNSIGNED NOT NULL,
        status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (friendship_id),
        UNIQUE KEY uq_friendship_pair (client_low_id, client_high_id),
        KEY idx_friendship_recipient_status (recipient_client_id, status),
        KEY idx_friendship_requester_status (requester_client_id, status),
        CONSTRAINT fk_friendship_low_client
          FOREIGN KEY (client_low_id) REFERENCES clients (client_id) ON DELETE CASCADE,
        CONSTRAINT fk_friendship_high_client
          FOREIGN KEY (client_high_id) REFERENCES clients (client_id) ON DELETE CASCADE,
        CONSTRAINT fk_friendship_requester_client
          FOREIGN KEY (requester_client_id) REFERENCES clients (client_id) ON DELETE CASCADE,
        CONSTRAINT fk_friendship_recipient_client
          FOREIGN KEY (recipient_client_id) REFERENCES clients (client_id) ON DELETE CASCADE,
        CONSTRAINT chk_friendship_distinct_clients CHECK (client_low_id < client_high_id)
      ) ENGINE=InnoDB
        DEFAULT CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
    `)
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_media (
        media_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        activity_id BIGINT UNSIGNED NOT NULL,
        media_kind ENUM('image', 'video') NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        media_data LONGBLOB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (media_id),
        KEY idx_activity_media_activity (activity_id),
        CONSTRAINT fk_activity_media_activity
          FOREIGN KEY (activity_id) REFERENCES activities (activity_id)
          ON DELETE CASCADE
    ) ENGINE=InnoDB
        DEFAULT CHARACTER SET utf8mb4
        COLLATE utf8mb4_unicode_ci
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_join_requests (
      request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      activity_id BIGINT UNSIGNED NOT NULL,
      applicant_client_id BIGINT UNSIGNED NOT NULL,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME NULL,
      PRIMARY KEY (request_id),
      UNIQUE KEY uq_activity_join_request (activity_id, applicant_client_id),
      KEY idx_activity_join_requests_status (activity_id, status, created_at),
      CONSTRAINT fk_join_request_activity FOREIGN KEY (activity_id)
        REFERENCES activities (activity_id) ON DELETE CASCADE,
      CONSTRAINT fk_join_request_applicant FOREIGN KEY (applicant_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  const [joinStatusColumn] = await pool.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activity_join_requests'
       AND COLUMN_NAME = 'status' LIMIT 1`,
  )
  if (joinStatusColumn[0] && !joinStatusColumn[0].COLUMN_TYPE.includes("'removed'")) {
    await pool.query(
      "ALTER TABLE activity_join_requests MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'removed') NOT NULL DEFAULT 'pending'",
    )
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_chat_messages (
      message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      activity_id BIGINT UNSIGNED NOT NULL,
      sender_client_id BIGINT UNSIGNED NOT NULL,
      message_text VARCHAR(2000) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (message_id),
      KEY idx_activity_chat_retention (created_at),
      KEY idx_activity_chat_activity (activity_id, created_at),
      CONSTRAINT fk_activity_chat_activity FOREIGN KEY (activity_id)
        REFERENCES activities (activity_id) ON DELETE CASCADE,
      CONSTRAINT fk_activity_chat_sender FOREIGN KEY (sender_client_id)
        REFERENCES clients (client_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `)
  await createChatTables(pool)
  await expireActivities()
  const activityCleanupTimer = setInterval(() => {
    expireActivities()
        .catch((error) => console.error('Failed to expire ended activities:', error))
  }, 60 * 1000)
  activityCleanupTimer.unref()

  const profileColumns = [
    ['spontiii_id', 'VARCHAR(40) NULL'],
    ['profile_city', 'VARCHAR(80) NULL'],
    ['profile_tagline', 'VARCHAR(160) NULL'],
    ['profile_bio', 'VARCHAR(500) NULL'],
    ['profile_tags', 'JSON NULL'],
    ['profile_photo', 'MEDIUMBLOB NULL'],
    ['profile_photo_mime', 'VARCHAR(50) NULL'],
    ['spontii_score', 'INT UNSIGNED NOT NULL DEFAULT 20'],
    ['spontii_points', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['lifetime_activities_created', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['last_daily_points_claim_date', 'DATE NULL'],
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

  await pool.query(
    `UPDATE clients c
     SET lifetime_activities_created = (
       SELECT COUNT(*) FROM activities a WHERE a.host_client_id = c.client_id
     )
     WHERE lifetime_activities_created = 0
       AND EXISTS (SELECT 1 FROM activities a WHERE a.host_client_id = c.client_id)`,
  )

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

  const server = createServer(app)
  attachChatSocket(server, {
    cookieName,
    frontendOrigins,
    isAllowedOrigin,
    verifySessionToken,
  })
  server.listen(port, () => {
    console.log(`Spontii API listening on http://localhost:${port}`)
  })
}

start().catch((error) => {
  console.error(`Unable to connect to database "${process.env.DB_NAME || 'spontiii'}":`, error.message)
  process.exitCode = 1
})
