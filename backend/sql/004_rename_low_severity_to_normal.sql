-- Rename the persisted Low severity to Normal without losing existing rows.
-- The temporary enum includes both values so existing data can be updated safely.

USE incident_management_db;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE incidents
  MODIFY COLUMN severity ENUM('Critical', 'High', 'Medium', 'Low', 'Normal') NOT NULL;

UPDATE incidents
SET severity = 'Normal'
WHERE LOWER(severity) = 'low';

ALTER TABLE incidents
  MODIFY COLUMN severity ENUM('Critical', 'High', 'Medium', 'Normal') NOT NULL;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version)
VALUES ('004_rename_low_severity_to_normal')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
