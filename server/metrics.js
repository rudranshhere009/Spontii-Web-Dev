/*
 * Daily counts for the admin dashboard, recorded when things happen because
 * the rows themselves are deleted later (event chat after 24 hours, DMs after
 * 90 days, events when they end).
 */
export function countDaily(db, metric, amount = 1) {
  return db.execute(
    `INSERT INTO daily_counters (counter_day, metric, counter_value)
     VALUES (CURRENT_DATE(), ?, ?)
     ON DUPLICATE KEY UPDATE counter_value = counter_value + VALUES(counter_value)`,
    [metric, amount],
  )
}
