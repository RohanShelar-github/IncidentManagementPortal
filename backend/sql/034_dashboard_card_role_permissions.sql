-- Allow each Dashboard KPI card to be assigned independently through Role Management.
-- Existing Dashboard users retain all current cards by default; administrators can
-- subsequently remove individual card permissions from the Roles screen.
START TRANSACTION;

INSERT INTO permissions(permission_key, permission_name) VALUES
('view_dashboard_total_incidents', 'Dashboard: Total Incidents'),
('view_dashboard_open_active', 'Dashboard: Open / Active'),
('view_dashboard_resolved', 'Dashboard: Resolved'),
('view_dashboard_avg_resolution', 'Dashboard: Avg Resolution'),
('view_dashboard_total_downtime', 'Dashboard: Total Downtime'),
('view_dashboard_historian_downtime', 'Dashboard: Historian Downtime'),
('view_dashboard_sla_breach', 'Dashboard: SLA Breach Rate'),
('view_dashboard_missed_mttr', 'Dashboard: Missed MTTR Count'),
('view_dashboard_missed_mttd', 'Dashboard: Missed MTTD Count'),
('view_dashboard_resolution_rate', 'Dashboard: Resolution Rate')
ON DUPLICATE KEY UPDATE permission_name = VALUES(permission_name);

-- Preserve existing dashboard visibility for every role that can already view it.
INSERT IGNORE INTO role_permissions(role_id, permission_key)
SELECT dashboard_roles.role_id, dashboard_permissions.permission_key
FROM role_permissions dashboard_roles
JOIN permissions dashboard_permissions
  ON dashboard_permissions.permission_key IN (
    'view_dashboard_total_incidents', 'view_dashboard_open_active',
    'view_dashboard_resolved', 'view_dashboard_avg_resolution',
    'view_dashboard_total_downtime', 'view_dashboard_historian_downtime',
    'view_dashboard_sla_breach', 'view_dashboard_missed_mttr',
    'view_dashboard_missed_mttd', 'view_dashboard_resolution_rate'
  )
WHERE dashboard_roles.permission_key = 'view_dashboard';

INSERT INTO schema_migrations(version) VALUES ('034_dashboard_card_role_permissions')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

COMMIT;
