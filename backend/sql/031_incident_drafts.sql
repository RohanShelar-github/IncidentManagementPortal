-- Draft incidents are deliberately separate from incidents. A draft never
-- appears in incident reporting, dashboard metrics, or notification mail.
CREATE TABLE IF NOT EXISTS incident_drafts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  draft_ref VARCHAR(32) NOT NULL,
  source_message_id VARCHAR(255) NOT NULL,
  operations_email_audit_id BIGINT NULL,
  source_received_at DATETIME NOT NULL,
  review_deadline_at DATETIME NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'reviewing',
  payload_json LONGTEXT NOT NULL,
  created_by INT NOT NULL,
  finalized_incident_id INT NULL,
  resolved_at DATETIME NULL,
  resolved_by INT NULL,
  deleted_at DATETIME NULL,
  deleted_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_incident_drafts_ref (draft_ref),
  KEY idx_incident_drafts_source (source_message_id),
  KEY idx_incident_drafts_owner_status (created_by, status),
  KEY idx_incident_drafts_deadline (review_deadline_at),
  CONSTRAINT incident_drafts_audit_fk FOREIGN KEY (operations_email_audit_id) REFERENCES operations_email_incident_audit(id) ON DELETE SET NULL,
  CONSTRAINT incident_drafts_owner_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT incident_drafts_finalized_incident_fk FOREIGN KEY (finalized_incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
  CONSTRAINT incident_drafts_resolved_by_fk FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT incident_drafts_deleted_by_fk FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('031_incident_drafts')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
