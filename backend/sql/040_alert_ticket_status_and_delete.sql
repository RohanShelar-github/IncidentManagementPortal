-- Two additions to the Alert Compliance report:
--   1. Customer Raised Tickets (category 'jira') get their own simple,
--      manually-set status (open/in_progress/resolved) instead of the
--      auto-derived alert activity state, which doesn't fit tickets (no
--      reliable "resolved" email signal exists for them).
--   2. Admin-only deletion of a false/irrelevant alert group from the
--      report. Alert groups are computed fresh from the mailbox on every
--      request (never persisted), so "delete" is recorded as a suppression
--      list the report filters against, not a literal row delete.
-- Both purely additive — new tables and one new permission, nothing
-- existing altered.
START TRANSACTION;

CREATE TABLE IF NOT EXISTS operations_alert_ticket_status (
  fingerprint_key CHAR(64) NOT NULL,
  alert_fingerprint VARCHAR(1000) NULL,
  status ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fingerprint_key),
  CONSTRAINT fk_operations_alert_ticket_status_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operations_alert_deletions (
  fingerprint_key CHAR(64) NOT NULL,
  alert_fingerprint VARCHAR(1000) NULL,
  deleted_by INT NULL,
  deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fingerprint_key),
  CONSTRAINT fk_operations_alert_deletions_user FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions(permission_key, permission_name) VALUES
('delete_alert_compliance_alerts', 'Delete Alert Compliance Alerts')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

-- Admin only, per explicit request.
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'delete_alert_compliance_alerts' FROM roles r WHERE r.role_key = 'admin';

INSERT INTO schema_migrations(version) VALUES ('040_alert_ticket_status_and_delete')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
