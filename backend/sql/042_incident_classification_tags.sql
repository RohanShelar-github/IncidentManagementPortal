-- Adds a single-select "Tag" classification (Customer vs Internal, extensible
-- via Data Management) to incidents. This is a distinct concept from the
-- existing free-text multi-tag chips already stored in incidents.tags (JSON)
-- — that older feature is being relabeled "User Tagging" in the UI so the
-- two are never confused; its column and behavior are untouched here.
--
-- Auto-applied at incident creation based on customer (see
-- incidentController.js resolveAutoTagId) and backfilled below for every
-- existing incident so the database reflects it immediately, not just going
-- forward.

CREATE TABLE IF NOT EXISTS incident_tags (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(50) NOT NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_incident_tags_name (name),
  CONSTRAINT fk_incident_tags_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO incident_tags (name) VALUES ('Customer'), ('Internal')
ON DUPLICATE KEY UPDATE name = VALUES(name);

SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'incidents' AND column_name = 'tag_id'
);
SET @column_sql = IF(
  @column_exists = 0,
  'ALTER TABLE incidents ADD COLUMN tag_id INT NULL AFTER tags, ADD CONSTRAINT fk_incidents_tag FOREIGN KEY (tag_id) REFERENCES incident_tags(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE incidents_tag_id_stmt FROM @column_sql;
EXECUTE incidents_tag_id_stmt;
DEALLOCATE PREPARE incidents_tag_id_stmt;

-- Backfill every existing incident: MIS Cloud/Matrix/Demo -> Internal, everything else -> Customer.
UPDATE incidents i
  JOIN incident_tags t ON t.name = 'Internal'
  SET i.tag_id = t.id
  WHERE i.customer IN ('MIS Cloud', 'Matrix', 'Demo');

UPDATE incidents i
  JOIN incident_tags t ON t.name = 'Customer'
  SET i.tag_id = t.id
  WHERE i.tag_id IS NULL;

INSERT INTO schema_migrations(version) VALUES ('042_incident_classification_tags')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
