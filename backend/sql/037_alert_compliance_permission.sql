-- Dedicated permission for the new Alert Compliance report (Operations
-- alerts with no incident created). Granted to Admin and PMO by default,
-- matching the roles that requested this report; other roles can be granted
-- it later via Role Management. Purely additive — no existing table altered.
START TRANSACTION;

INSERT INTO permissions(permission_key, permission_name) VALUES
('view_alert_compliance_report', 'View Alert Compliance Report')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'view_alert_compliance_report' FROM roles r WHERE r.role_key IN ('admin', 'pmo');

INSERT INTO schema_migrations(version) VALUES ('037_alert_compliance_permission')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
