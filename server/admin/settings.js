/*
 * Platform settings the admin portal can change without a deploy. Values are
 * cached in memory (single API instance) and reloaded every 30 seconds, so the
 * request paths that read them never wait on the database.
 */

const bool = (value) => (typeof value === 'boolean' ? value : undefined)
const points = (max) => (value) =>
  (Number.isInteger(value) && value >= 0 && value <= max ? value : undefined)
const message = (max) => (value) =>
  (typeof value === 'string' && value.trim().length <= max ? value.trim() : undefined)

const SETTINGS = {
  daily_claim_points: { default: 20, validate: points(1000) },
  event_required_base: { default: 100, validate: points(100000) },
  event_required_step: { default: 50, validate: points(100000) },
  event_award_points: { default: 50, validate: points(100000) },
  signups_enabled: { default: true, validate: bool },
  event_creation_enabled: { default: true, validate: bool },
  dms_enabled: { default: true, validate: bool },
  maintenance: {
    default: { enabled: false, message: '' },
    validate: (value) => {
      if (!value || typeof value !== 'object') return undefined
      const enabled = bool(value.enabled)
      const text = message(300)(value.message ?? '')
      return enabled === undefined || text === undefined ? undefined : { enabled, message: text }
    },
  },
  site_banner: {
    default: { enabled: false, level: 'info', message: '' },
    validate: (value) => {
      if (!value || typeof value !== 'object') return undefined
      const enabled = bool(value.enabled)
      const text = message(300)(value.message ?? '')
      const level = ['info', 'warning'].includes(value.level) ? value.level : undefined
      if (enabled === undefined || text === undefined || !level) return undefined
      if (enabled && !text) return undefined
      return { enabled, level, message: text }
    },
  },
}

const cache = Object.fromEntries(Object.entries(SETTINGS).map(([key, spec]) => [key, spec.default]))
let lastLoadedAt = null

export function getSetting(key) {
  return cache[key]
}

export function allSettings() {
  return { ...cache }
}

export function settingsLoadedAt() {
  return lastLoadedAt
}

export async function loadSettings(db) {
  const [rows] = await db.query('SELECT setting_key, setting_value FROM app_settings')
  for (const row of rows) {
    const spec = SETTINGS[row.setting_key]
    if (!spec) continue
    const raw = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value
    const value = spec.validate(raw)
    if (value !== undefined) cache[row.setting_key] = value
  }
  lastLoadedAt = new Date()
}

export function startSettingsRefresh(db) {
  const timer = setInterval(() => {
    loadSettings(db).catch((error) => console.error('Failed to reload app settings:', error))
  }, 30 * 1000)
  timer.unref()
}

/* Returns { values } for valid input or { message } naming the first invalid key. */
export function validateSettingChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return { message: 'Send the settings to change.' }
  }
  const entries = Object.entries(changes)
  if (!entries.length) return { message: 'No settings were changed.' }
  const values = {}
  for (const [key, raw] of entries) {
    const spec = SETTINGS[key]
    if (!spec) return { message: `Unknown setting: ${key}.` }
    const value = spec.validate(raw)
    if (value === undefined) return { message: `Invalid value for ${key}.` }
    values[key] = value
  }
  return { values }
}

export async function saveSettings(db, values, adminId) {
  for (const [key, value] of Object.entries(values)) {
    await db.execute(
      `INSERT INTO app_settings (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [key, JSON.stringify(value), adminId],
    )
  }
}

export function applySettings(values) {
  Object.assign(cache, values)
}

/* What the public app needs to know before the user does anything. */
export function publicAppConfig() {
  return {
    maintenance: cache.maintenance,
    banner: cache.site_banner.enabled ? cache.site_banner : null,
    signupsEnabled: cache.signups_enabled,
    eventCreationEnabled: cache.event_creation_enabled,
    dmsEnabled: cache.dms_enabled,
    dailyClaimPoints: cache.daily_claim_points,
  }
}

export function eventRequiredPoints(activitiesCreated) {
  return cache.event_required_base + activitiesCreated * cache.event_required_step
}
