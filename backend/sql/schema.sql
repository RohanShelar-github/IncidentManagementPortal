-- Current production baseline including additive normalization migration 005.
-- This file provisions an empty database; it intentionally contains no users or credentials.

CREATE DATABASE IF NOT EXISTS incident_management_db
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE incident_management_db;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','cso','pmo','aoc','engineer','stakeholder','viewer') DEFAULT 'viewer',
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY email (email)
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
  components TEXT NULL,
  applications TEXT NULL,
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
  is_read TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, is_read),
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
  ('005_incident_canonical_normalization')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
