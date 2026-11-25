-- Dedicated permission gating the CSO Incidents page (all customers' Jira
-- "Customer Raised Tickets" in one category-wise view) and the same ticket
-- panel embedded in the Operations mailbox detail view — one permission for
-- the whole Jira-ticket-management capability (view + comment + status
-- change), since both surfaces act on the same Jira data.
-- Admin-only by default; other roles can be granted it later via Role
-- Management. Purely additive — no existing table altered.
START TRANSACTION;

INSERT INTO permissions(permission_key, permission_name) VALUES
('view_cso_incidents', 'View CSO Incidents')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT r.id, 'view_cso_incidents' FROM roles r WHERE r.role_key IN ('admin');

INSERT INTO schema_migrations(version) VALUES ('050_cso_incidents_permission')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
