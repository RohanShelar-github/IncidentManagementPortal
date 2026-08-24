-- Current production baseline including additive normalization migration 005.
-- This file provisions an empty database; it intentionally contains no users or credentials.

CREATE DATABASE IF NOT EXISTS incident_management_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE incident_management_db;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id INT NOT NULL AUTO_INCREMENT,
  role_key VARCHAR(50) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  icon VARCHAR(32) NULL,
  color VARCHAR(20) NOT NULL DEFAULT 'blue',
  description VARCHAR(500) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_roles_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles(role_key, role_name, icon, color, description, is_system) VALUES
('admin','Admin','shield','purple','Full access to all portal features including user and role management.',1),
('cso','CSO','globe','green','Cloud Service Operations — manages and resolves incidents, generates reports.',0),
('pmo','PMO','clipboard','yellow','Project Management Office — read-only access to incidents and reports.',0),
('aoc','AOC','wrench','red','Area Operations Center — operational incident handling and reporting.',0),
('engineer','Engineer','tools','blue','Field engineer — can create and manage assigned incidents.',0),
('stakeholder','Stakeholder','eye','gray','Read-only observer — can view dashboard and incidents only.',0)
ON DUPLICATE KEY UPDATE role_name=VALUES(role_name);

CREATE TABLE IF NOT EXISTS permissions (
  permission_key VARCHAR(50) NOT NULL,
  permission_name VARCHAR(100) NOT NULL,
  PRIMARY KEY (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL, permission_key VARCHAR(50) NOT NULL,
  PRIMARY KEY (role_id, permission_key),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO permissions(permission_key, permission_name) VALUES
('view_dashboard','View Dashboard'),('view_incidents','View Incidents'),('create_incidents','Create Incidents'),
('edit_incidents','Edit Incidents'),('close_incidents','Close Incidents'),('view_reports','View Reports'),
('export_reports','Export Reports'),('view_customer360','View Customer 360'),('manage_users','Manage Users'),
('view_mailbox','View Mailbox'),('send_mailbox','Send Mailbox Replies'),('delete_mailbox','Delete Mailbox Emails'),('manage_roles','Manage Roles'),('assign_roles','Assign Roles'),('manage_data','Manage Data')
ON DUPLICATE KEY UPDATE permission_name=VALUES(permission_name);
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key FROM roles r CROSS JOIN permissions p WHERE r.role_key='admin';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id,p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN ('view_dashboard','view_incidents','edit_incidents','close_incidents','view_reports','export_reports','view_customer360') WHERE r.role_key='cso';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id,p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN ('view_dashboard','view_incidents','view_reports','export_reports','view_customer360') WHERE r.role_key='pmo';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id,p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN ('view_dashboard','view_incidents','create_incidents','edit_incidents','close_incidents','view_reports','export_reports','view_customer360') WHERE r.role_key='aoc';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id,p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN ('view_dashboard','view_incidents','create_incidents','edit_incidents','close_incidents','view_reports','view_customer360') WHERE r.role_key='engineer';
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id,p.permission_key FROM roles r JOIN permissions p ON p.permission_key IN ('view_dashboard','view_incidents') WHERE r.role_key='stakeholder';

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  department VARCHAR(100) NULL,
  location VARCHAR(100) NULL,
  bio VARCHAR(1000) NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'stakeholder',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY email (email),
  CONSTRAINT fk_users_role FOREIGN KEY (role) REFERENCES roles(role_key) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id INT NOT NULL AUTO_INCREMENT,
  customer_name VARCHAR(255) NOT NULL,
  customer_code VARCHAR(50) NOT NULL,
  customer_branch VARCHAR(255) NULL,
  region VARCHAR(100) NULL,
  timezone VARCHAR(64) NULL,
  inbound_csm_name VARCHAR(255) NULL,
  outbound_csm_name VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NULL,
  updated_by INT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_name (customer_name),
  UNIQUE KEY uq_customers_code (customer_code),
  KEY idx_customers_active_name (is_active, customer_name),
  KEY idx_customers_region (region),
  KEY idx_customers_csm (inbound_csm_name, outbound_csm_name),
  CONSTRAINT fk_customers_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_customers_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS area (
  id INT NOT NULL AUTO_INCREMENT,
  area_name VARCHAR(100) NOT NULL,
  area_code VARCHAR(50) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by INT NULL,
  updated_by INT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_area_name (area_name),
  UNIQUE KEY uq_area_code (area_code),
  KEY idx_area_active_name (is_active, area_name),
  CONSTRAINT fk_area_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_area_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incidents (
  id INT NOT NULL AUTO_INCREMENT,
  incident_ref VARCHAR(20) NOT NULL,
  legacy_case_number VARCHAR(50) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  severity ENUM('low','medium','high','critical','normal') NULL,
  status ENUM('open','in_progress','tier_1_level_support','further_investigation','escalated_to_rd','escalated_to_cso_devops','escalated_to_3rd_party','resolved','closed') DEFAULT 'open',
  assigned_to INT NULL,
  case_owner VARCHAR(255) NULL,
  created_by INT NOT NULL,
  customer VARCHAR(255) NOT NULL,
  customer_id INT NULL,
  project VARCHAR(255) NULL,
  project_area VARCHAR(255) NULL,
  area VARCHAR(100) NULL,
  area_id INT NULL,
  product_line VARCHAR(100) NULL,
  sla_hours FLOAT NULL,
  sla_minutes SMALLINT UNSIGNED NULL,
  tags JSON NULL,
  comments JSON NULL,
  start_dt VARCHAR(30) NULL,
  date_time_opened DATETIME NULL,
  opened_at_utc DATETIME(6) NULL,
  end_dt VARCHAR(30) NULL,
  date_time_closed DATETIME NULL,
  closed_at_utc DATETIME(6) NULL,
  closed_date DATE NULL,
  timezone VARCHAR(10) DEFAULT 'IST',
  source_timezone VARCHAR(64) NULL,
  downtime_hours INT DEFAULT 0,
  downtime_minutes INT DEFAULT 0,
  downtime_mins INT NOT NULL DEFAULT 0,
  downtime_str VARCHAR(20) NULL,
  rca TEXT NULL,
  resolution TEXT NULL,
  resolved_by VARCHAR(255) NULL,
  sf_case_no VARCHAR(50) NULL,
  incident_report_status VARCHAR(30) NULL,
  mttd_str VARCHAR(20) NULL,
  mttd_minutes INT NULL,
  legacy_month VARCHAR(20) NULL,
  account_name VARCHAR(255) NULL,
  internal_status VARCHAR(100) NULL,
  rd_tickets VARCHAR(500) NULL,
  legacy_source VARCHAR(100) NULL,
  legacy_raw JSON NULL,
  mttr_str VARCHAR(20) NULL,
  mttr_minutes INT UNSIGNED NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY incident_ref (incident_ref),
  KEY assigned_to (assigned_to),
  KEY created_by (created_by),
  KEY idx_incidents_status (status),
  KEY idx_incidents_severity (severity),
  KEY idx_incidents_customer (customer),
  KEY idx_incidents_created (created_at),
  KEY idx_incidents_customer_id (customer_id),
  KEY idx_incidents_area_id (area_id),
  KEY idx_incidents_legacy_case_number (legacy_case_number),
  KEY idx_incidents_case_owner (case_owner),
  KEY idx_incidents_product_line (product_line),
  KEY idx_incidents_open_closed (date_time_opened, date_time_closed),
  KEY idx_incidents_reporting (customer_id, area_id, severity, status, closed_date),
  KEY idx_incidents_sf_case_no (sf_case_no),
  KEY idx_incidents_customer_opened_utc (customer_id, opened_at_utc),
  KEY idx_incidents_status_opened_utc (status, opened_at_utc),
  KEY idx_incidents_closed_at_utc (closed_at_utc),
  KEY idx_incidents_project_opened_utc (project, opened_at_utc),
  CONSTRAINT fk_incidents_area_id FOREIGN KEY (area_id) REFERENCES area(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_incidents_customer_id FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT incidents_ibfk_1 FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT incidents_ibfk_2 FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT chk_incidents_downtime_nonnegative CHECK (downtime_mins >= 0),
  CONSTRAINT chk_incidents_mttd_nonnegative CHECK (mttd_minutes IS NULL OR mttd_minutes >= 0),
  CONSTRAINT chk_incidents_mttr_nonnegative CHECK (mttr_minutes IS NULL OR mttr_minutes >= 0),
  CONSTRAINT chk_incidents_utc_order CHECK (closed_at_utc IS NULL OR opened_at_utc IS NULL OR closed_at_utc >= opened_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incident_legacy_metadata (
  incident_id INT NOT NULL,
  legacy_month VARCHAR(20) NULL,
  legacy_source VARCHAR(100) NULL,
  legacy_raw JSON NULL,
  internal_status VARCHAR(100) NULL,
  project_area VARCHAR(255) NULL,
  archived_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  refreshed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (incident_id),
  KEY idx_incident_legacy_source (legacy_source),
  CONSTRAINT fk_incident_legacy_metadata_incident
    FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id INT NOT NULL AUTO_INCREMENT,
  incident_id INT NULL,
  action_type VARCHAR(50) NOT NULL,
  action_by INT NULL,
  detail TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY action_by (action_by),
  KEY idx_activity_incident (incident_id),
  CONSTRAINT activity_logs_ibfk_1 FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  CONSTRAINT activity_logs_ibfk_2 FOREIGN KEY (action_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT NOT NULL AUTO_INCREMENT,
  message TEXT NOT NULL,
  user_id INT NULL,
  type VARCHAR(30) NOT NULL DEFAULT 'info',
  incident_ref VARCHAR(20) NULL,
  is_mention TINYINT(1) NOT NULL DEFAULT 0,
  actor_id INT NULL,
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, is_read),
  KEY idx_notif_retention (created_at),
  CONSTRAINT notifications_ibfk_1 FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations(version) VALUES
  ('002_legacy_incident_master_data'),
  ('003_persist_incident_timezone_mttd'),
  ('004_rename_low_severity_to_normal'),
  ('005_incident_canonical_normalization'),
  ('013_user_profile_fields'),
  ('014_database_roles'),
  ('015_repair_incident_timezone_values')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
