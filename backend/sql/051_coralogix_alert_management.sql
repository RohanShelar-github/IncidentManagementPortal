-- Coralogix Alert Management: lets a permitted user snooze (disable for a
-- fixed duration, auto re-enabled by the backend's coralogixSnoozeScheduler)
-- and tune (threshold/wait-time) real Coralogix alert definitions.
-- coralogix_alert_snoozes tracks ONLY snoozes initiated from this app — a
-- row's presence is the sole signal the scheduler acts on; an alert a human
-- disabled directly in Coralogix's own UI has no row here and is never
-- auto re-enabled by this app.
-- Purely additive — new table and one new permission, nothing existing
-- altered.
START TRANSACTION;

CREATE TABLE IF NOT EXISTS coralogix_alert_snoozes (
  alert_id VARCHAR(64) NOT NULL PRIMARY KEY,
  alert_name VARCHAR(500) NULL,
  snoozed_until DATETIME NOT NULL,
  snoozed_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_coralogix_alert_snoozes_until (snoozed_until),
  CONSTRAINT fk_coralogix_alert_snoozes_user FOREIGN KEY (snoozed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions(permission_key, permission_name) VALUES
('manage_coralogix_alerts', 'Manage Coralogix Alerts')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'manage_coralogix_alerts' FROM roles r WHERE r.role_key IN ('admin');

INSERT INTO schema_migrations(version) VALUES ('051_coralogix_alert_management')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
