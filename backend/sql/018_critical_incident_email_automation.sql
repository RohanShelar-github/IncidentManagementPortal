-- Configuration and audit storage for Critical Incident communications.
CREATE TABLE IF NOT EXISTS customer_email_recipient_configs (
  id INT NOT NULL AUTO_INCREMENT,
  customer_id INT NULL,
  customer_name VARCHAR(255) NOT NULL,
  to_recipients TEXT NOT NULL,
  cc_recipients TEXT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  effective_date DATE NOT NULL,
  last_updated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_critical_email_config (customer_id),
  KEY idx_customer_email_config_active (is_enabled, effective_date),
  CONSTRAINT fk_customer_email_config_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_customer_email_config_user FOREIGN KEY (last_updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO customer_email_recipient_configs (customer_id, customer_name, to_recipients, cc_recipients, is_enabled, effective_date)
SELECT id, customer_name,
  'jkaplan@magicsoftware.com,Mayur_Jaipurkar@magicsoftware.com,Abhishek_Gawali@magicsoftware.com,Rohan_Vikhe@magicsoftware.com,jaiprakash_prajapati@magicsoftware.com',
  'Rohan_Shelar@magicsoftware.com,its24x7@magicsoftware.com,cloudopssupport@magicsoftware.com', 1, CURDATE()
FROM customers WHERE LOWER(customer_name) = 'ngc'
ON DUPLICATE KEY UPDATE customer_name=VALUES(customer_name), to_recipients=VALUES(to_recipients), cc_recipients=VALUES(cc_recipients), is_enabled=VALUES(is_enabled), effective_date=VALUES(effective_date);

CREATE TABLE IF NOT EXISTS incident_email_threads (
  id BIGINT NOT NULL AUTO_INCREMENT,
  incident_id INT NOT NULL,
  customer_name VARCHAR(255) NULL,
  conversation_id VARCHAR(255) NULL,
  graph_thread_id VARCHAR(255) NULL,
  message_id VARCHAR(255) NULL,
  internet_message_id VARCHAR(500) NULL,
  subject VARCHAR(255) NOT NULL,
  status ENUM('draft','sent','queued','failed','delivered') NOT NULL DEFAULT 'draft',
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_incident_email_threads_incident (incident_id), KEY idx_incident_email_threads_conversation (conversation_id),
  CONSTRAINT fk_incident_email_threads_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  CONSTRAINT fk_incident_email_threads_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incident_email_messages (
  id BIGINT NOT NULL AUTO_INCREMENT,
  thread_id BIGINT NULL,
  incident_id INT NOT NULL,
  direction ENUM('outbound','inbound') NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  graph_message_id VARCHAR(255) NULL,
  internet_message_id VARCHAR(500) NULL,
  subject VARCHAR(255) NULL,
  sender VARCHAR(500) NULL,
  recipients TEXT NULL,
  cc_recipients TEXT NULL,
  body_preview TEXT NULL,
  status VARCHAR(30) NOT NULL,
  error_details TEXT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INT NULL,
  PRIMARY KEY (id), UNIQUE KEY uq_incident_email_graph_message (graph_message_id), KEY idx_incident_email_messages_incident (incident_id, occurred_at),
  CONSTRAINT fk_incident_email_messages_thread FOREIGN KEY (thread_id) REFERENCES incident_email_threads(id) ON DELETE SET NULL,
  CONSTRAINT fk_incident_email_messages_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  CONSTRAINT fk_incident_email_messages_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('018_critical_incident_email_automation') ON DUPLICATE KEY UPDATE applied_at=applied_at;
