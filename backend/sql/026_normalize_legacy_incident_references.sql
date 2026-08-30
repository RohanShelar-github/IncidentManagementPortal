-- Converts numeric legacy Salesforce values in incidents.incident_ref into
-- sequential portal IDs while retaining the original value in sf_case_no.
-- The audit table is also the rollback source; do not delete it.

CREATE TABLE IF NOT EXISTS incident_ref_normalization_audit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  migration_version VARCHAR(100) NOT NULL,
  incident_id INT NOT NULL,
  previous_incident_ref VARCHAR(100) NOT NULL,
  new_incident_ref VARCHAR(100) NOT NULL,
  previous_sf_case_no VARCHAR(255) NULL,
  normalized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_incident_ref_normalization (migration_version, incident_id),
  KEY idx_incident_ref_normalization_incident (incident_id)
);

START TRANSACTION;

SET @next_incident_number = (
  SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(incident_ref, '-', -1) AS UNSIGNED)), 0)
  FROM incidents
  WHERE incident_ref REGEXP '^INC-[0-9]+$'
);

CREATE TEMPORARY TABLE incident_ref_normalization_mapping AS
SELECT id,
       incident_ref AS previous_incident_ref,
       sf_case_no AS previous_sf_case_no,
       CONCAT('INC-', CAST(@next_incident_number + ROW_NUMBER() OVER (ORDER BY id) AS UNSIGNED)) AS new_incident_ref
FROM incidents
WHERE incident_ref IS NOT NULL
  AND TRIM(incident_ref) <> ''
  AND incident_ref NOT REGEXP '^INC-[0-9]+$';

INSERT INTO incident_ref_normalization_audit (
  migration_version, incident_id, previous_incident_ref, new_incident_ref, previous_sf_case_no
)
SELECT '026_normalize_legacy_incident_references', id, previous_incident_ref, new_incident_ref, previous_sf_case_no
FROM incident_ref_normalization_mapping
ON DUPLICATE KEY UPDATE normalized_at = normalized_at;

UPDATE incidents i
JOIN incident_ref_normalization_mapping m ON m.id = i.id
SET i.incident_ref = m.new_incident_ref,
    i.sf_case_no = COALESCE(NULLIF(i.sf_case_no, ''), m.previous_incident_ref);

DROP TEMPORARY TABLE incident_ref_normalization_mapping;

INSERT INTO schema_migrations(version) VALUES ('026_normalize_legacy_incident_references')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;

-- Rollback procedure (run only if validation fails):
-- START TRANSACTION;
-- UPDATE incidents i
-- JOIN incident_ref_normalization_audit a ON a.incident_id = i.id
-- SET i.incident_ref = a.previous_incident_ref,
--     i.sf_case_no = a.previous_sf_case_no
-- WHERE a.migration_version = '026_normalize_legacy_incident_references';
-- DELETE FROM schema_migrations WHERE version = '026_normalize_legacy_incident_references';
-- COMMIT;
