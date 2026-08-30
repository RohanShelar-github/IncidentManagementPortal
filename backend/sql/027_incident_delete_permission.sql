-- Grant incident deletion as a separately configurable role permission.
START TRANSACTION;

INSERT INTO permissions(permission_key, permission_name) VALUES
('delete_incidents', 'Delete Incidents')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

-- Preserve all existing role assignments. Only Admin receives the new permission by default.
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r
JOIN permissions p ON p.permission_key = 'delete_incidents'
WHERE r.role_key = 'admin';

INSERT INTO schema_migrations(version) VALUES ('027_incident_delete_permission')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
