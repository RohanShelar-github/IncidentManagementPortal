-- Make Draft Review access and deletion independently assignable by role.
START TRANSACTION;

INSERT INTO permissions(permission_key, permission_name) VALUES
('view_drafts', 'View Drafts'),
('delete_drafts', 'Delete Drafts')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

-- Existing incident creators can review the drafts they created. Administrators
-- retain access even if their role was customised without create_incidents.
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT DISTINCT rp.role_id, 'view_drafts'
FROM role_permissions rp
WHERE rp.permission_key = 'create_incidents';

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'view_drafts'
FROM roles r
WHERE r.role_key = 'admin';

-- Draft removal is restricted to Admin by default.
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'delete_drafts'
FROM roles r
WHERE r.role_key = 'admin';

INSERT INTO schema_migrations(version) VALUES ('032_draft_role_permissions')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
