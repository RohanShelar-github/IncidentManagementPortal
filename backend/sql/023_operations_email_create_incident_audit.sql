-- Audit trail for incident drafts created from Operations emails. It does not
-- alter Graph mail or existing incident/customer data.
CREATE TABLE IF NOT EXISTS operations_email_incident_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  graph_message_id VARCHAR(255) NOT NULL,
  email_subject VARCHAR(500) NULL,
  source_category VARCHAR(30) NOT NULL,
  identified_customer_id INT NULL,
  identified_customer_name VARCHAR(255) NULL,
  jira_project_code VARCHAR(50) NULL,
  match_location VARCHAR(30) NOT NULL DEFAULT 'none',
  incident_id INT NULL,
  status VARCHAR(30) NOT NULL,
  requested_by INT NOT NULL,
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_operations_email_audit_message (graph_message_id),
  KEY idx_operations_email_audit_incident (incident_id),
  CONSTRAINT operations_email_audit_customer_fk FOREIGN KEY (identified_customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT operations_email_audit_incident_fk FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL,
  CONSTRAINT operations_email_audit_user_fk FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('023_operations_email_create_incident_audit')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
