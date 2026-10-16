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
