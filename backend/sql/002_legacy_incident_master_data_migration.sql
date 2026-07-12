-- Migration: legacy incident import support plus customer/area master data
-- Target DB: incident_management_db
-- Safe execution notes:
--   1. Take a verified backup before running.
--   2. Run the PRE-MIGRATION VALIDATION queries and resolve unexpected duplicates first.
--   3. Execute this script in order.
--   4. Existing incidents.customer and incidents.area are preserved for backward compatibility.

USE incident_management_db;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- PRE-MIGRATION VALIDATION
SELECT 'duplicate incident refs' AS check_name, incident_ref, COUNT(*) AS count
FROM incidents
GROUP BY incident_ref
HAVING COUNT(*) > 1;

SELECT 'blank incident customer text' AS check_name, COUNT(*) AS count
FROM incidents
WHERE customer IS NULL OR TRIM(customer) = '';

SELECT 'customer spelling variants' AS check_name,
       LOWER(TRIM(customer)) AS normalized,
       GROUP_CONCAT(DISTINCT customer ORDER BY customer SEPARATOR ' | ') AS variants,
       COUNT(*) AS rows_seen
FROM incidents
WHERE customer IS NOT NULL AND TRIM(customer) <> ''
GROUP BY LOWER(TRIM(customer))
HAVING COUNT(DISTINCT customer) > 1;

SELECT 'area spelling variants' AS check_name,
       LOWER(TRIM(area)) AS normalized,
       GROUP_CONCAT(DISTINCT area ORDER BY area SEPARATOR ' | ') AS variants,
       COUNT(*) AS rows_seen
FROM incidents
WHERE area IS NOT NULL AND TRIM(area) <> ''
GROUP BY LOWER(TRIM(area))
HAVING COUNT(DISTINCT area) > 1;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN p_table VARCHAR(64), IN p_column VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = p_table AND column_name = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE add_index_if_missing(IN p_table VARCHAR(64), IN p_index VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = p_table AND index_name = p_index
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

CREATE PROCEDURE add_fk_if_missing(IN p_table VARCHAR(64), IN p_fk VARCHAR(64), IN p_definition TEXT)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = DATABASE() AND table_name = p_table AND constraint_name = p_fk
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD CONSTRAINT `', p_fk, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE incidents CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CALL add_column_if_missing('incidents', 'customer_id', 'INT NULL AFTER customer');
CALL add_column_if_missing('incidents', 'area_id', 'INT NULL AFTER area');

-- Legacy import fields from Incidents Sample.xlsx.
CALL add_column_if_missing('incidents', 'legacy_case_number', 'VARCHAR(50) NULL AFTER incident_ref');
CALL add_column_if_missing('incidents', 'project_area', 'VARCHAR(255) NULL AFTER project');
CALL add_column_if_missing('incidents', 'product_line', 'VARCHAR(100) NULL AFTER area_id');
CALL add_column_if_missing('incidents', 'case_owner', 'VARCHAR(255) NULL AFTER assigned_to');
CALL add_column_if_missing('incidents', 'date_time_opened', 'DATETIME NULL AFTER start_dt');
CALL add_column_if_missing('incidents', 'date_time_closed', 'DATETIME NULL AFTER end_dt');
CALL add_column_if_missing('incidents', 'closed_date', 'DATE NULL AFTER date_time_closed');
CALL add_column_if_missing('incidents', 'incident_report_status', 'VARCHAR(30) NULL AFTER sf_case_no');
CALL add_column_if_missing('incidents', 'downtime_mins', 'INT NOT NULL DEFAULT 0 AFTER downtime_minutes');
CALL add_column_if_missing('incidents', 'mttd_minutes', 'INT NULL AFTER mttd_str');
CALL add_column_if_missing('incidents', 'legacy_month', 'VARCHAR(20) NULL AFTER mttd_minutes');
CALL add_column_if_missing('incidents', 'account_name', 'VARCHAR(255) NULL AFTER legacy_month');
CALL add_column_if_missing('incidents', 'internal_status', 'VARCHAR(100) NULL AFTER account_name');
CALL add_column_if_missing('incidents', 'rd_tickets', 'VARCHAR(500) NULL AFTER internal_status');
CALL add_column_if_missing('incidents', 'legacy_source', 'VARCHAR(100) NULL AFTER rd_tickets');
CALL add_column_if_missing('incidents', 'legacy_raw', 'JSON NULL AFTER legacy_source');

INSERT INTO area (area_name, area_code)
VALUES ('Infrastructure', 'infrastructure'), ('Application', 'application')
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO area (area_name, area_code)
SELECT DISTINCT
       TRIM(i.area),
       LOWER(REGEXP_REPLACE(TRIM(i.area), '[^A-Za-z0-9]+', '_'))
FROM incidents i
WHERE i.area IS NOT NULL AND TRIM(i.area) <> ''
ON DUPLICATE KEY UPDATE is_active = 1;

INSERT INTO customers (customer_name, customer_code, timezone)
SELECT DISTINCT
       TRIM(i.customer),
       LOWER(REGEXP_REPLACE(TRIM(i.customer), '[^A-Za-z0-9]+', '_')),
       NULL
FROM incidents i
WHERE i.customer IS NOT NULL AND TRIM(i.customer) <> ''
ON DUPLICATE KEY UPDATE is_active = 1;

UPDATE incidents i
JOIN customers c ON LOWER(c.customer_name) = LOWER(TRIM(i.customer))
SET i.customer_id = c.id
WHERE i.customer_id IS NULL;

UPDATE incidents i
JOIN area a ON LOWER(a.area_name) = LOWER(TRIM(i.area))
SET i.area_id = a.id
WHERE i.area_id IS NULL;

UPDATE incidents
SET date_time_opened = COALESCE(date_time_opened, STR_TO_DATE(REPLACE(start_dt, 'T', ' '), '%Y-%m-%d %H:%i:%s')),
    date_time_closed = COALESCE(date_time_closed, STR_TO_DATE(REPLACE(end_dt, 'T', ' '), '%Y-%m-%d %H:%i:%s')),
    downtime_mins = CASE
      WHEN downtime_mins IS NULL OR downtime_mins = 0 THEN COALESCE(downtime_hours, 0) * 60 + COALESCE(downtime_minutes, 0)
      ELSE downtime_mins
    END
WHERE start_dt IS NOT NULL OR end_dt IS NOT NULL OR downtime_hours IS NOT NULL OR downtime_minutes IS NOT NULL;

CALL add_index_if_missing('incidents', 'idx_incidents_customer_id', 'INDEX idx_incidents_customer_id (customer_id)');
CALL add_index_if_missing('incidents', 'idx_incidents_area_id', 'INDEX idx_incidents_area_id (area_id)');
CALL add_index_if_missing('incidents', 'idx_incidents_legacy_case_number', 'INDEX idx_incidents_legacy_case_number (legacy_case_number)');
CALL add_index_if_missing('incidents', 'idx_incidents_case_owner', 'INDEX idx_incidents_case_owner (case_owner)');
CALL add_index_if_missing('incidents', 'idx_incidents_product_line', 'INDEX idx_incidents_product_line (product_line)');
CALL add_index_if_missing('incidents', 'idx_incidents_open_closed', 'INDEX idx_incidents_open_closed (date_time_opened, date_time_closed)');
CALL add_index_if_missing('incidents', 'idx_incidents_reporting', 'INDEX idx_incidents_reporting (customer_id, area_id, severity, status, closed_date)');

CALL add_fk_if_missing('incidents', 'fk_incidents_customer_id', 'FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT ON UPDATE CASCADE');
CALL add_fk_if_missing('incidents', 'fk_incidents_area_id', 'FOREIGN KEY (area_id) REFERENCES area(id) ON DELETE RESTRICT ON UPDATE CASCADE');

DROP PROCEDURE add_column_if_missing;
DROP PROCEDURE add_index_if_missing;
DROP PROCEDURE add_fk_if_missing;

INSERT INTO schema_migrations(version)
VALUES ('002_legacy_incident_master_data')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

-- POST-MIGRATION VERIFICATION
SELECT 'customers' AS check_name, COUNT(*) AS count FROM customers;
SELECT 'area' AS check_name, COUNT(*) AS count FROM area;
SELECT 'incidents missing customer_id' AS check_name, COUNT(*) AS count
FROM incidents
WHERE customer IS NOT NULL AND TRIM(customer) <> '' AND customer_id IS NULL;
SELECT 'incidents missing area_id' AS check_name, COUNT(*) AS count
FROM incidents
WHERE area IS NOT NULL AND TRIM(area) <> '' AND area_id IS NULL;
SELECT 'orphan customer_id' AS check_name, COUNT(*) AS count
FROM incidents i LEFT JOIN customers c ON c.id = i.customer_id
WHERE i.customer_id IS NOT NULL AND c.id IS NULL;
SELECT 'orphan area_id' AS check_name, COUNT(*) AS count
FROM incidents i LEFT JOIN area a ON a.id = i.area_id
WHERE i.area_id IS NOT NULL AND a.id IS NULL;

-- ROLLBACK STRATEGY
-- Preferred rollback: restore the backup taken immediately before running this migration.
-- Logical compatibility rollback:
--   ALTER TABLE incidents DROP FOREIGN KEY fk_incidents_customer_id;
--   ALTER TABLE incidents DROP FOREIGN KEY fk_incidents_area_id;
--   Keep added columns and master tables until imported legacy data is exported/confirmed unused.
--   Existing incidents.customer and incidents.area are preserved, so old application code can continue to read them.
