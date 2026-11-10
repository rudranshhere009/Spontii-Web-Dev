/*
 * Admin tables and the columns the admin portal adds to existing tables.
 * Same approach as start() in index.js: CREATE TABLE IF NOT EXISTS, then add
 * any missing column after checking INFORMATION_SCHEMA, so it is safe to run
 * on every startup and on databases imported from older dumps.
 */

const TABLE_OPTIONS = `ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci`

const TABLES = [
  `CREATE TABLE IF NOT EXISTS admin_users (
    admin_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(254) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin') NOT NULL DEFAULT 'super_admin',
    status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at DATETIME NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (admin_id),
    UNIQUE KEY uq_admin_users_email (email)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS admin_login_challenges (
    challenge_id CHAR(36) NOT NULL,
    admin_id INT UNSIGNED NOT NULL,
    otp_hash CHAR(64) NOT NULL,
    otp_expires_at DATETIME NOT NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    last_sent_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (challenge_id),
    KEY idx_admin_login_challenges_admin (admin_id),
    CONSTRAINT fk_admin_challenge_admin
      FOREIGN KEY (admin_id) REFERENCES admin_users (admin_id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS admin_sessions (
    session_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    token_hash CHAR(64) NOT NULL,
    admin_id INT UNSIGNED NOT NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    PRIMARY KEY (session_id),
    UNIQUE KEY uq_admin_sessions_token (token_hash),
    KEY idx_admin_sessions_admin (admin_id, revoked_at),
    CONSTRAINT fk_admin_session_admin
      FOREIGN KEY (admin_id) REFERENCES admin_users (admin_id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  /* No foreign key on the target: the trail must outlive deleted users and events. */
  `CREATE TABLE IF NOT EXISTS admin_audit_log (
    audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    admin_id INT UNSIGNED NULL,
    action VARCHAR(60) NOT NULL,
    target_type VARCHAR(30) NULL,
    target_id VARCHAR(64) NULL,
    details JSON NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (audit_id),
    KEY idx_admin_audit_created (created_at),
    KEY idx_admin_audit_admin (admin_id, created_at),
    KEY idx_admin_audit_target (target_type, target_id, created_at),
    KEY idx_admin_audit_action (action, created_at)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(60) NOT NULL,
    setting_value JSON NOT NULL,
    updated_by INT UNSIGNED NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS admin_announcements (
    announcement_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(500) NOT NULL,
    route VARCHAR(255) NULL,
    audience JSON NOT NULL,
    recipients_count INT UNSIGNED NOT NULL DEFAULT 0,
    sent_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (announcement_id),
    KEY idx_admin_announcements_created (created_at)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS admin_user_notes (
    note_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id BIGINT UNSIGNED NOT NULL,
    admin_id INT UNSIGNED NULL,
    note VARCHAR(2000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id),
    KEY idx_admin_user_notes_client (client_id, created_at),
    CONSTRAINT fk_admin_note_client
      FOREIGN KEY (client_id) REFERENCES clients (client_id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS points_ledger (
    entry_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id BIGINT UNSIGNED NOT NULL,
    delta INT NOT NULL,
    balance_after INT UNSIGNED NOT NULL,
    source ENUM('daily_claim', 'event_created', 'admin_adjust') NOT NULL,
    admin_id INT UNSIGNED NULL,
    reason VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entry_id),
    KEY idx_points_ledger_client (client_id, created_at),
    CONSTRAINT fk_points_ledger_client
      FOREIGN KEY (client_id) REFERENCES clients (client_id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  /* Ended events are deleted with their media and chat; this keeps the facts for history and analytics. */
  `CREATE TABLE IF NOT EXISTS activity_archive (
    archive_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) NOT NULL,
    host_client_id BIGINT UNSIGNED NULL,
    host_name VARCHAR(100) NOT NULL,
    title VARCHAR(120) NOT NULL,
    category VARCHAR(80) NOT NULL,
    visibility VARCHAR(20) NOT NULL,
    vibe VARCHAR(60) NULL,
    city VARCHAR(80) NOT NULL,
    state VARCHAR(80) NOT NULL DEFAULT '',
    area VARCHAR(160) NOT NULL,
    latitude DECIMAL(10, 7) NULL,
    longitude DECIMAL(10, 7) NULL,
    event_tags JSON NULL,
    capacity SMALLINT UNSIGNED NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    event_created_at TIMESTAMP NULL DEFAULT NULL,
    completed_by VARCHAR(10) NOT NULL DEFAULT 'system',
    approved_count INT UNSIGNED NOT NULL DEFAULT 0,
    pending_count INT UNSIGNED NOT NULL DEFAULT 0,
    rejected_count INT UNSIGNED NOT NULL DEFAULT 0,
    removed_count INT UNSIGNED NOT NULL DEFAULT 0,
    image_count INT UNSIGNED NOT NULL DEFAULT 0,
    video_count INT UNSIGNED NOT NULL DEFAULT 0,
    chat_message_count INT UNSIGNED NOT NULL DEFAULT 0,
    report_count INT UNSIGNED NOT NULL DEFAULT 0,
    archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (archive_id),
    UNIQUE KEY uq_activity_archive_public (public_id),
    KEY idx_activity_archive_host (host_client_id),
    KEY idx_activity_archive_ends (ends_at)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS client_login_history (
    login_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    client_id BIGINT UNSIGNED NOT NULL,
    method ENUM('password', 'otp') NOT NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (login_id),
    KEY idx_client_login_history_client (client_id, created_at),
    KEY idx_client_login_history_created (created_at),
    CONSTRAINT fk_login_history_client
      FOREIGN KEY (client_id) REFERENCES clients (client_id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS client_activity_days (
    client_id BIGINT UNSIGNED NOT NULL,
    activity_day DATE NOT NULL,
    PRIMARY KEY (client_id, activity_day),
    KEY idx_client_activity_days_day (activity_day),
    CONSTRAINT fk_activity_day_client
      FOREIGN KEY (client_id) REFERENCES clients (client_id) ON DELETE CASCADE
  ) ${TABLE_OPTIONS}`,

  /* Counted when it happens, because chat (24h) and events (at end) are deleted later. */
  `CREATE TABLE IF NOT EXISTS daily_counters (
    counter_day DATE NOT NULL,
    metric VARCHAR(40) NOT NULL,
    counter_value INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (counter_day, metric)
  ) ${TABLE_OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS blocked_identities (
    blocked_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    kind ENUM('email', 'phone') NOT NULL,
    identity_value VARCHAR(254) NOT NULL,
    reason VARCHAR(255) NULL,
    admin_id INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocked_id),
    UNIQUE KEY uq_blocked_identity (kind, identity_value)
  ) ${TABLE_OPTIONS}`,
]

const COLUMNS = {
  clients: [
    ['account_status', "ENUM('active', 'suspended', 'banned') NOT NULL DEFAULT 'active'"],
    ['status_reason', 'VARCHAR(500) NULL'],
    ['suspended_until', 'DATETIME NULL'],
    ['session_version', 'INT UNSIGNED NOT NULL DEFAULT 0'],
    ['last_seen_at', 'DATETIME NULL'],
    ['spontii_verified', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['warning_count', 'INT UNSIGNED NOT NULL DEFAULT 0'],
  ],
  activities: [
    ['completed_by', "ENUM('host', 'system', 'admin') NULL"],
    ['chat_message_count', 'INT UNSIGNED NOT NULL DEFAULT 0'],
  ],
  message_reports: [
    ['context_id', 'VARCHAR(64) NULL'],
    ['context_label', 'VARCHAR(160) NULL'],
    ['reviewed_by_admin_id', 'INT UNSIGNED NULL'],
    ['reviewed_at', 'DATETIME NULL'],
    ['resolution_note', 'VARCHAR(500) NULL'],
    ['action_taken', 'VARCHAR(30) NULL'],
  ],
}

const INDEXES = {
  clients: [
    ['idx_clients_account_status', 'KEY idx_clients_account_status (account_status)'],
    ['idx_clients_created', 'KEY idx_clients_created (created_at)'],
  ],
  message_reports: [
    ['idx_message_reports_reported', 'KEY idx_message_reports_reported (reported_client_id, created_at)'],
  ],
}

export async function addMissingColumns(pool, table, columns) {
  const [existing] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  )
  const names = new Set(existing.map((column) => column.COLUMN_NAME))
  for (const [columnName, definition] of columns) {
    if (!names.has(columnName)) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${columnName} ${definition}`)
    }
  }
}

async function addMissingIndexes(pool, table, indexes) {
  const [existing] = await pool.query(
    `SELECT DISTINCT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  )
  const names = new Set(existing.map((index) => index.INDEX_NAME))
  for (const [indexName, definition] of indexes) {
    if (!names.has(indexName)) {
      await pool.query(`ALTER TABLE ${table} ADD ${definition}`)
    }
  }
}

/* Runs after the app's own tables exist (clients, activities, message_reports). */
export async function createAdminTables(pool) {
  for (const statement of TABLES) {
    await pool.query(statement)
  }
  for (const [table, columns] of Object.entries(COLUMNS)) {
    await addMissingColumns(pool, table, columns)
  }
  for (const [table, indexes] of Object.entries(INDEXES)) {
    await addMissingIndexes(pool, table, indexes)
  }
}
