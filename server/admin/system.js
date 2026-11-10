import { mailConfigured } from '../mail.js'
import { writeAudit } from './audit.js'
import { settingsLoadedAt } from './settings.js'

const startedAt = new Date()

export function registerSystemRoutes(router, { pool, getSocketStats, cleanupStats, runCleanup }) {
  router.get('/system', async (_request, response) => {
    const pingStart = process.hrtime.bigint()
    await pool.query('SELECT 1')
    const latencyMs = Number(process.hrtime.bigint() - pingStart) / 1e6
    const [[db]] = await pool.query('SELECT VERSION() AS version, DATABASE() AS name')
    const [tables] = await pool.query(
      `SELECT TABLE_NAME AS name, TABLE_ROWS AS row_estimate, DATA_LENGTH + INDEX_LENGTH AS bytes
       FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY bytes DESC`,
    )
    const memory = process.memoryUsage()
    response.json({
      database: {
        name: db.name,
        version: db.version,
        latencyMs: Math.round(latencyMs * 10) / 10,
        totalBytes: tables.reduce((total, table) => total + Number(table.bytes || 0), 0),
      },
      server: {
        node: process.version,
        environment: process.env.NODE_ENV || 'development',
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
        memoryMb: Math.round(memory.rss / 1024 / 1024),
        heapMb: Math.round(memory.heapUsed / 1024 / 1024),
      },
      sockets: getSocketStats(),
      cleanup: { ...cleanupStats },
      mail: {
        configured: mailConfigured(),
        transport: process.env.MAIL_TRANSPORT === 'console' ? 'console (development)' : 'gmail',
      },
      security: {
        trustProxy: process.env.TRUST_PROXY || '0',
        adminIpAllowlist: Boolean((process.env.ADMIN_IP_ALLOWLIST || '').trim()),
        frontendOrigins: (process.env.FRONTEND_ORIGIN || '').split(',').map((value) => value.trim()).filter(Boolean),
        seedPasswordStillSet: Boolean(process.env.SUPER_ADMIN_PASSWORD),
      },
      settingsLoadedAt: settingsLoadedAt()?.toISOString() ?? null,
      tables: tables.map((table) => ({
        name: table.name,
        rows: Number(table.row_estimate || 0),
        bytes: Number(table.bytes || 0),
      })),
    })
  })

  router.post('/system/cleanup', async (request, response) => {
    await runCleanup()
    await writeAudit(pool, request, 'system.cleanup_run', { details: { ...cleanupStats } })
    response.json({ cleanup: { ...cleanupStats } })
  })
}
