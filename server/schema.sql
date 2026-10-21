CREATE TABLE IF NOT EXISTS clients (
  client_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  phone_number VARCHAR(20) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  spontiii_id VARCHAR(40) NOT NULL,
  profile_city VARCHAR(80) NULL,
  profile_tagline VARCHAR(160) NULL,
  profile_bio VARCHAR(500) NULL,
  profile_tags JSON NULL,
  profile_photo MEDIUMBLOB NULL,
  profile_photo_mime VARCHAR(50) NULL,
  spontii_score INT UNSIGNED NOT NULL DEFAULT 20,
  spontii_points INT UNSIGNED NOT NULL DEFAULT 0,
  lifetime_activities_created INT UNSIGNED NOT NULL DEFAULT 0,
  last_daily_points_claim_date DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id),
  UNIQUE KEY uq_clients_phone_number (phone_number),
  UNIQUE KEY uq_clients_email (email),
  UNIQUE KEY uq_clients_spontiii_id (spontiii_id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

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
  COLLATE utf8mb4_unicode_ci;

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
  COLLATE utf8mb4_unicode_ci;

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
  COLLATE utf8mb4_unicode_ci;

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
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_join_requests (
  request_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  activity_id BIGINT UNSIGNED NOT NULL,
  applicant_client_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'removed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  PRIMARY KEY (request_id),
  UNIQUE KEY uq_activity_join_request (activity_id, applicant_client_id),
  KEY idx_activity_join_requests_status (activity_id, status, created_at),
  CONSTRAINT fk_join_request_activity
    FOREIGN KEY (activity_id) REFERENCES activities (activity_id) ON DELETE CASCADE,
  CONSTRAINT fk_join_request_applicant
    FOREIGN KEY (applicant_client_id) REFERENCES clients (client_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_chat_messages (
  message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  activity_id BIGINT UNSIGNED NOT NULL,
  sender_client_id BIGINT UNSIGNED NOT NULL,
  message_text VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id),
  KEY idx_activity_chat_retention (created_at),
  KEY idx_activity_chat_activity (activity_id, created_at),
  CONSTRAINT fk_activity_chat_activity
    FOREIGN KEY (activity_id) REFERENCES activities (activity_id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_chat_sender
    FOREIGN KEY (sender_client_id) REFERENCES clients (client_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

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
  COLLATE utf8mb4_unicode_ci;

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
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_client_id BIGINT UNSIGNED NOT NULL,
  blocked_client_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (blocker_client_id, blocked_client_id),
  KEY idx_user_blocks_blocked (blocked_client_id),
  CONSTRAINT fk_user_block_blocker
    FOREIGN KEY (blocker_client_id) REFERENCES clients (client_id) ON DELETE CASCADE,
  CONSTRAINT fk_user_block_blocked
    FOREIGN KEY (blocked_client_id) REFERENCES clients (client_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- No activity foreign key: events are deleted when they end, DM history is not.
CREATE TABLE IF NOT EXISTS direct_conversations (
  conversation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_low_id BIGINT UNSIGNED NOT NULL,
  client_high_id BIGINT UNSIGNED NOT NULL,
  low_last_read_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  high_last_read_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_message_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id),
  UNIQUE KEY uq_direct_conversation_pair (client_low_id, client_high_id),
  KEY idx_direct_conversation_high (client_high_id, last_message_at),
  CONSTRAINT fk_direct_conversation_low
    FOREIGN KEY (client_low_id) REFERENCES clients (client_id) ON DELETE CASCADE,
  CONSTRAINT fk_direct_conversation_high
    FOREIGN KEY (client_high_id) REFERENCES clients (client_id) ON DELETE CASCADE,
  CONSTRAINT chk_direct_conversation_distinct CHECK (client_low_id < client_high_id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS direct_messages (
  message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_client_id BIGINT UNSIGNED NOT NULL,
  message_text VARCHAR(2000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id),
  KEY idx_direct_messages_conversation (conversation_id, message_id),
  KEY idx_direct_messages_retention (created_at),
  CONSTRAINT fk_direct_message_conversation
    FOREIGN KEY (conversation_id) REFERENCES direct_conversations (conversation_id) ON DELETE CASCADE,
  CONSTRAINT fk_direct_message_sender
    FOREIGN KEY (sender_client_id) REFERENCES clients (client_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_chat_reads (
  activity_id BIGINT UNSIGNED NOT NULL,
  client_id BIGINT UNSIGNED NOT NULL,
  last_read_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (activity_id, client_id),
  CONSTRAINT fk_activity_chat_read_activity
    FOREIGN KEY (activity_id) REFERENCES activities (activity_id) ON DELETE CASCADE,
  CONSTRAINT fk_activity_chat_read_client
    FOREIGN KEY (client_id) REFERENCES clients (client_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- The snapshot outlives the message, which may be deleted by retention.
CREATE TABLE IF NOT EXISTS message_reports (
  report_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporter_client_id BIGINT UNSIGNED NOT NULL,
  reported_client_id BIGINT UNSIGNED NOT NULL,
  source ENUM('event', 'direct') NOT NULL,
  message_id BIGINT UNSIGNED NOT NULL,
  message_snapshot VARCHAR(2000) NOT NULL,
  reason VARCHAR(40) NOT NULL,
  status ENUM('open', 'reviewed', 'actioned') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (report_id),
  UNIQUE KEY uq_message_report_once (reporter_client_id, source, message_id),
  KEY idx_message_reports_status (status, created_at),
  CONSTRAINT fk_message_report_reporter
    FOREIGN KEY (reporter_client_id) REFERENCES clients (client_id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
