import express from 'express'
import { registerAdminTeamRoutes } from './admins.js'
import { registerAuditRoutes } from './audit.js'
import { createAdminAuth, ipAllowlist } from './auth.js'
import { registerEventRoutes } from './events.js'
import { registerPlatformRoutes } from './platform.js'
import { registerReportRoutes } from './reports.js'
import { registerStatsRoutes } from './stats.js'
import { registerSystemRoutes } from './system.js'
import { registerUserRoutes } from './users.js'
import { HttpError } from './util.js'

/*
 * Super admin API, mounted at /api/admin. Every route below the public auth
 * routes requires an admin session; every change is written to the audit log.
 * `deps` carries the pieces of the main app the admin routes reuse.
 */
export function registerAdminRoutes(app, deps) {
  const router = express.Router()
  const auth = createAdminAuth(deps)

  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store')
    next()
  })
  router.use(ipAllowlist)

  auth.registerPublicRoutes(router)
  router.use(auth.requireAdmin)
  auth.registerAccountRoutes(router)

  /* Counts for the sidebar. */
  router.get('/badges', async (_request, response) => {
    const [[row]] = await deps.pool.query(
      "SELECT COUNT(*) AS open_reports FROM message_reports WHERE status = 'open'",
    )
    response.json({ openReports: Number(row.open_reports) })
  })

  registerStatsRoutes(router, deps)
  registerUserRoutes(router, deps)
  registerEventRoutes(router, deps)
  registerReportRoutes(router, deps)
  registerPlatformRoutes(router, deps)
  registerAuditRoutes(router, deps)
  registerAdminTeamRoutes(router, deps)
  registerSystemRoutes(router, deps)

  router.use((_request, response) => {
    response.status(404).json({ message: 'Not found.' })
  })
  router.use((error, _request, response, next) => {
    if (error instanceof HttpError) {
      return response.status(error.status).json({ message: error.message, ...error.extra })
    }
    return next(error)
  })

  app.use('/api/admin', router)
}
