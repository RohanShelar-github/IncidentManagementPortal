-- Make Microsoft 365 mailbox access assignable through Role Management.
INSERT INTO permissions(permission_key, permission_name) VALUES
('view_mailbox','View Mailbox'),
('send_mailbox','Send Mailbox Replies')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

-- Preserve current administrator access; administrators can grant either permission to other roles.
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, p.permission_key
FROM roles r JOIN permissions p ON p.permission_key IN ('view_mailbox','send_mailbox')
WHERE r.role_key = 'admin';

INSERT INTO schema_migrations(version) VALUES ('016_mailbox_role_permissions')
ON DUPLICATE KEY UPDATE applied_at=applied_at;
