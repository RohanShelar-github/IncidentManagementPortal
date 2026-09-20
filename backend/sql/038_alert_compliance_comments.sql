-- Comment thread for the Alert Compliance report. Alert groups are computed
-- on demand (no persisted "alert" row exists), so comments are keyed by a
-- stable SHA-256 hash of the alert's fingerprint (sender + normalized
-- subject) rather than a foreign key. Purely additive — a brand new table,
-- nothing existing is altered. Dropping this table fully reverts the feature.
START TRANSACTION;

CREATE TABLE IF NOT EXISTS operations_alert_comments (
  id INT NOT NULL AUTO_INCREMENT,
  fingerprint_key CHAR(64) NOT NULL,
  alert_fingerprint VARCHAR(1000) NULL,
  comment_text TEXT NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_operations_alert_comments_fingerprint_key (fingerprint_key),
  CONSTRAINT fk_operations_alert_comments_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('038_alert_compliance_comments')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
