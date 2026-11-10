/*
 * Dashboard numbers. Users and signups come from `clients`; daily active users
 * from `client_activity_days`; events and messages from `daily_counters`,
 * because those rows are deleted later. Days follow the database's time zone.
 */

const SERIES_METRICS = ['events_created', 'event_messages', 'direct_messages']

export function registerStatsRoutes(router, { pool }) {
  router.get('/stats/overview', async (_request, response) => {
    const [[users]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(account_status = 'active') AS active,
              SUM(account_status = 'suspended') AS suspended,
              SUM(account_status = 'banned') AS banned,
              SUM(spontii_verified) AS verified,
              SUM(created_at >= CURRENT_DATE()) AS today,
              SUM(created_at >= NOW() - INTERVAL 7 DAY) AS week,
              SUM(created_at >= NOW() - INTERVAL 30 DAY) AS month,
              COALESCE(SUM(spontii_points), 0) AS points
       FROM clients`,
    )
    const [[activeUsers]] = await pool.query(
      `SELECT COUNT(DISTINCT IF(activity_day = CURRENT_DATE(), client_id, NULL)) AS dau,
              COUNT(DISTINCT IF(activity_day > CURRENT_DATE() - INTERVAL 7 DAY, client_id, NULL)) AS wau,
              COUNT(DISTINCT client_id) AS mau
       FROM client_activity_days WHERE activity_day > CURRENT_DATE() - INTERVAL 30 DAY`,
    )
    const [[events]] = await pool.query(
      `SELECT COUNT(*) AS live,
              SUM(visibility = 'public') AS public_live,
              SUM(visibility = 'friends') AS friends_live,
              SUM(visibility = 'private') AS private_live,
              SUM(starts_at <= UTC_TIMESTAMP()) AS happening_now
       FROM activities WHERE status = 'active' AND ends_at > UTC_TIMESTAMP()`,
    )
    const [[archive]] = await pool.query(
      `SELECT COUNT(*) AS total,
              SUM(ends_at > UTC_TIMESTAMP() - INTERVAL 30 DAY) AS month,
              SUM(completed_by = 'admin' AND ends_at > UTC_TIMESTAMP() - INTERVAL 30 DAY) AS closed_by_admin,
              COALESCE(AVG(approved_count + 1), 0) AS avg_attendees
       FROM activity_archive`,
    )
    const [[requests]] = await pool.query(
      `SELECT COUNT(*) AS pending FROM activity_join_requests jr
       JOIN activities a ON a.activity_id = jr.activity_id
       WHERE jr.status = 'pending' AND a.status = 'active'`,
    )
    const [[reports]] = await pool.query(
      `SELECT SUM(status = 'open') AS open,
              SUM(status = 'open' AND reason = 'safety') AS open_safety,
              SUM(status <> 'open' AND reviewed_at > NOW() - INTERVAL 7 DAY) AS resolved_week
       FROM message_reports`,
    )
    const [counters] = await pool.query(
      `SELECT metric, counter_value FROM daily_counters WHERE counter_day = CURRENT_DATE()`,
    )
    const today = Object.fromEntries(counters.map((row) => [row.metric, Number(row.counter_value)]))
    const [[friends]] = await pool.query("SELECT COUNT(*) AS accepted FROM friendships WHERE status = 'accepted'")
    const [completion] = await pool.query(
      `SELECT (profile_photo_mime IS NOT NULL) + (COALESCE(profile_city, '') <> '')
              + (COALESCE(profile_tagline, '') <> '') + (COALESCE(profile_bio, '') <> '')
              + (profile_tags IS NOT NULL AND JSON_LENGTH(profile_tags) > 0) AS fields,
              COUNT(*) AS total
       FROM clients WHERE account_status = 'active' GROUP BY fields ORDER BY fields`,
    )

    const number = (value) => Number(value || 0)
    response.json({
      users: {
        total: number(users.total),
        active: number(users.active),
        suspended: number(users.suspended),
        banned: number(users.banned),
        verified: number(users.verified),
        newToday: number(users.today),
        newWeek: number(users.week),
        newMonth: number(users.month),
        pointsInCirculation: number(users.points),
      },
      activeUsers: { dau: number(activeUsers.dau), wau: number(activeUsers.wau), mau: number(activeUsers.mau) },
      events: {
        live: number(events.live),
        public: number(events.public_live),
        friends: number(events.friends_live),
        private: number(events.private_live),
        happeningNow: number(events.happening_now),
        createdToday: today.events_created || 0,
        endedMonth: number(archive.month),
        closedByAdminMonth: number(archive.closed_by_admin),
        archivedTotal: number(archive.total),
        averageAttendees: Math.round(Number(archive.avg_attendees) * 10) / 10,
        pendingRequests: number(requests.pending),
      },
      reports: {
        open: number(reports.open),
        openSafety: number(reports.open_safety),
        resolvedWeek: number(reports.resolved_week),
      },
      messagesToday: { event: today.event_messages || 0, direct: today.direct_messages || 0 },
      friendships: number(friends.accepted),
      profileCompletion: completion.map((row) => ({ percent: Number(row.fields) * 20, users: Number(row.total) })),
    })
  })

  router.get('/stats/timeseries', async (request, response) => {
    const days = Math.min(Math.max(Number.parseInt(request.query.days, 10) || 30, 7), 180)
    const [[{ today }]] = await pool.query("SELECT DATE_FORMAT(CURRENT_DATE(), '%Y-%m-%d') AS today")
    const dates = Array.from({ length: days }, (_, index) => {
      const date = new Date(`${today}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() - (days - 1 - index))
      return date.toISOString().slice(0, 10)
    })
    const series = Object.fromEntries(['signups', 'active_users', ...SERIES_METRICS].map((metric) => [metric, {}]))

    const [signups] = await pool.execute(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS total
       FROM clients WHERE created_at >= CURRENT_DATE() - INTERVAL ? DAY GROUP BY day`,
      [days - 1],
    )
    for (const row of signups) series.signups[row.day] = Number(row.total)
    const [active] = await pool.execute(
      `SELECT DATE_FORMAT(activity_day, '%Y-%m-%d') AS day, COUNT(*) AS total
       FROM client_activity_days WHERE activity_day >= CURRENT_DATE() - INTERVAL ? DAY GROUP BY day`,
      [days - 1],
    )
    for (const row of active) series.active_users[row.day] = Number(row.total)
    const [counters] = await pool.execute(
      `SELECT DATE_FORMAT(counter_day, '%Y-%m-%d') AS day, metric, counter_value
       FROM daily_counters WHERE counter_day >= CURRENT_DATE() - INTERVAL ? DAY`,
      [days - 1],
    )
    for (const row of counters) {
      if (series[row.metric]) series[row.metric][row.day] = Number(row.counter_value)
    }

    response.json({
      dates,
      series: Object.fromEntries(Object.entries(series).map(([metric, values]) => [metric, dates.map((day) => values[day] || 0)])),
    })
  })

  router.get('/stats/places', async (_request, response) => {
    const [userCities] = await pool.query(
      `SELECT profile_city AS place, COUNT(*) AS total FROM clients
       WHERE COALESCE(profile_city, '') <> '' AND account_status = 'active'
       GROUP BY profile_city ORDER BY total DESC LIMIT 8`,
    )
    const [eventStates] = await pool.query(
      `SELECT place, SUM(total) AS total FROM (
         SELECT COALESCE(NULLIF(state, ''), city) AS place, COUNT(*) AS total FROM activities
         WHERE status = 'active' AND ends_at > UTC_TIMESTAMP() GROUP BY place
         UNION ALL
         SELECT COALESCE(NULLIF(state, ''), city) AS place, COUNT(*) AS total FROM activity_archive
         WHERE ends_at > UTC_TIMESTAMP() - INTERVAL 30 DAY GROUP BY place
       ) combined GROUP BY place ORDER BY total DESC LIMIT 8`,
    )
    const rows = (list) => list.map((row) => ({ place: row.place, total: Number(row.total) }))
    response.json({ userCities: rows(userCities), eventPlaces: rows(eventStates) })
  })
}
