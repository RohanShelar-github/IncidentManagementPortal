-- Adds a dedicated Jira project-code field without changing existing customer data.
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'customers'
    AND column_name = 'jira_project_code'
);
SET @column_sql = IF(
  @column_exists = 0,
  'ALTER TABLE customers ADD COLUMN jira_project_code VARCHAR(50) NULL AFTER timezone',
  'SELECT 1'
);
PREPARE jira_customer_column_stmt FROM @column_sql;
EXECUTE jira_customer_column_stmt;
DEALLOCATE PREPARE jira_customer_column_stmt;

CREATE TABLE IF NOT EXISTS customer_jira_project_code_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  customer_id INT NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  previous_jira_project_code VARCHAR(50) NULL,
  new_jira_project_code VARCHAR(50) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_customer_jira_code_audit_customer (customer_id, updated_at),
  CONSTRAINT customer_jira_code_audit_customer_fk
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES ('022_customer_jira_project_codes')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
