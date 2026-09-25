-- Manual sub-status for a resolved alert (confirmed_resolved / manually_resolved)
-- that has no incident auto-linked to it — lets a PMO/Admin record whether
-- creating a real incident for it is still pending, was done (outside the
-- automatic mailbox-link flow), or simply isn't required for this alert.
-- The main STATE badge stays "Resolved" either way; this is a separate,
-- optional signal shown in the Incident column. Purely additive — a brand
-- new table, nothing existing is altered. Dropping this table fully reverts
-- the feature.
START TRANSACTION;

CREATE TABLE IF NOT EXISTS operations_alert_incident_substatus (
  fingerprint_key CHAR(64) NOT NULL,
  alert_fingerprint VARCHAR(1000) NULL,
  substatus ENUM('pending','created','not_required') NOT NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (fingerprint_key),
  CONSTRAINT fk_operations_alert_incident_substatus_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('041_alert_incident_substatus')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
