'use strict';

const pool = require('../config/database');

async function hasRolePermission(roleKey, permission) {
  const [rows] = await pool.query(
    `SELECT 1
       FROM roles r
       JOIN role_permissions rp ON rp.role_id = r.id
      WHERE LOWER(r.role_key) = LOWER(?) AND rp.permission_key = ?
      LIMIT 1`,
    [roleKey || '', permission]
  );
  return rows.length > 0;
}

function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (await hasRolePermission(req.user?.role, permission)) return next();
      return res.status(403).json({ success: false, message: 'Your role does not have permission to perform this action.' });
    } catch (error) {
      console.error('Permission lookup error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };
}

function requireAdmin(req, res, next) {
  if (String(req.user?.role || '').toLowerCase() === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Administrator permission is required for this action.' });
}

async function requireClosePermissionWhenClosing(req, res, next) {
  const requestedStatus = String(req.body?.status || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (requestedStatus !== 'closed') return next();
  return requirePermission('close_incidents')(req, res, next);
}

module.exports = { hasRolePermission, requirePermission, requireAdmin, requireClosePermissionWhenClosing };
