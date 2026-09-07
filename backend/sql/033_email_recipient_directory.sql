-- Shared address book for Notification Preview recipient suggestions.
-- It stores active portal-user emails and customer-configured critical-alert
-- recipients independently from the user-management directory.
START TRANSACTION;

CREATE TABLE IF NOT EXISTS email_recipient_directory (
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(255) NULL,
  is_portal_user TINYINT(1) NOT NULL DEFAULT 0,
  is_customer_recipient TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (email),
  KEY idx_email_recipient_directory_active (is_active, display_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO email_recipient_directory (email, display_name, is_portal_user, is_active)
SELECT LOWER(TRIM(email)), full_name, 1, 1
FROM users
WHERE is_active = 1
  AND email IS NOT NULL
  AND TRIM(email) <> ''
ON DUPLICATE KEY UPDATE
  display_name = VALUES(display_name),
  is_portal_user = 1,
  is_active = 1;

INSERT INTO schema_migrations(version) VALUES ('033_email_recipient_directory')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
