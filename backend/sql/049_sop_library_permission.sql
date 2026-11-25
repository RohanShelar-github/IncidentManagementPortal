-- Dedicated permission gating the SOP Library page and its backend routes
-- (suggestion lookup from the mailbox's Find SOP button, the library listing,
-- and individual page content). Previously reused view_mailbox; now its own
-- key so admins can grant/revoke SOP Library access independently of
-- Operations mailbox access via Role Management.
-- Admin-only by default; other roles can be granted it later via Role
-- Management. Purely additive — no existing table altered.
START TRANSACTION;

INSERT INTO permissions(permission_key, permission_name) VALUES
('view_sop_library', 'View SOP Library')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'view_sop_library' FROM roles r WHERE r.role_key IN ('admin');

INSERT INTO schema_migrations(version) VALUES ('049_sop_library_permission')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
