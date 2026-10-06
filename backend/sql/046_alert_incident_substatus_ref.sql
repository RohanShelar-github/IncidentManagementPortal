-- Lets a human record the actual Incident ID against an alert when the
-- incident was created the normal way (the Incidents tab's own "Create
-- Incident" button) rather than via the Operations Mailbox's per-alert
-- "+ Create Incident" button — which is the only flow that auto-links an
-- incident today (see operations_email_incident_audit). Without this, such
-- an incident has no way to show up against its alert in the Alert
-- Compliance Report at all. Only meaningful alongside substatus='created'
-- (see 041_alert_incident_substatus.sql); additive column, nullable.
SET @column_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'operations_alert_incident_substatus'
    AND column_name = 'incident_ref'
);
SET @column_sql = IF(
  @column_exists = 0,
  "ALTER TABLE operations_alert_incident_substatus ADD COLUMN incident_ref VARCHAR(20) NULL AFTER substatus",
  'SELECT 1'
);
PREPARE alert_incident_substatus_ref_stmt FROM @column_sql;
EXECUTE alert_incident_substatus_ref_stmt;
DEALLOCATE PREPARE alert_incident_substatus_ref_stmt;

INSERT INTO schema_migrations(version) VALUES ('046_alert_incident_substatus_ref')
ON DUPLICATE KEY UPDATE applied_at = applied_at;
