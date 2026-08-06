const pool = require('../config/database');

const PERMISSIONS = ['view_dashboard','view_incidents','create_incidents','edit_incidents','close_incidents','view_reports','export_reports','view_customer360','manage_users','manage_roles','assign_roles','manage_data'];

function requireAdmin(req, res) {
  if (String(req.user.role || '').toLowerCase() !== 'admin') {
    res.status(403).json({ success: false, message: 'Only administrators can manage roles' });
    return false;
  }
  return true;
}

async function readRoles(connection = pool) {
  const [rows] = await connection.query(`
    SELECT r.id, r.role_key, r.role_name, r.icon, r.color, r.description, r.is_system,
           COUNT(DISTINCT u.id) AS user_count,
           GROUP_CONCAT(DISTINCT rp.permission_key ORDER BY rp.permission_key) AS permission_keys
      FROM roles r
      LEFT JOIN users u ON u.role = r.role_key
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
     GROUP BY r.id
     ORDER BY r.id`);
  return rows.map(row => ({
    key: row.role_key, name: row.role_name, icon: row.icon || '', color: row.color,
    desc: row.description || '', system: Boolean(row.is_system), users: Number(row.user_count || 0),
    perms: row.permission_keys ? row.permission_keys.split(',') : []
  }));
}

const getRoles = async (req, res) => {
  try { return res.json({ success: true, data: await readRoles() }); }
  catch (error) { console.error('Get roles error:', error); return res.status(500).json({ success: false, message: 'Internal server error' }); }
};

const saveRoles = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const submitted = Array.isArray(req.body.roles) ? req.body.roles : [];
  if (!submitted.length) return res.status(400).json({ success: false, message: 'At least one role is required' });
  const keys = new Set();
  for (const role of submitted) {
    role.key = String(role.key || '').trim().toLowerCase();
    role.name = String(role.name || '').trim();
    role.perms = Array.isArray(role.perms) ? [...new Set(role.perms)] : [];
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(role.key) || !role.name || role.name.length > 100) {
      return res.status(400).json({ success: false, message: 'Invalid role name or key' });
    }
    if (keys.has(role.key) || role.perms.some(permission => !PERMISSIONS.includes(permission))) {
      return res.status(400).json({ success: false, message: 'Duplicate role or invalid permission' });
    }
    keys.add(role.key);
  }
  if (!keys.has('admin')) return res.status(400).json({ success: false, message: 'Admin role is required' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [assigned] = await connection.query('SELECT DISTINCT role FROM users');
    const assignedKeys = assigned.map(row => row.role);
    const [existing] = await connection.query('SELECT role_key, is_system FROM roles');
    for (const row of existing) {
      if (!keys.has(row.role_key) && (row.is_system || assignedKeys.includes(row.role_key))) {
        throw Object.assign(new Error(`Role ${row.role_key} cannot be deleted because it is protected or assigned`), { status: 409 });
      }
    }
    for (const role of submitted) {
      await connection.query(`INSERT INTO roles(role_key,role_name,icon,color,description,is_system)
        VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE role_name=VALUES(role_name),icon=VALUES(icon),color=VALUES(color),description=VALUES(description)`,
        [role.key, role.name, String(role.icon || '').slice(0, 32), String(role.color || 'blue').slice(0, 20), String(role.desc || '').slice(0, 500), role.key === 'admin' ? 1 : 0]);
      const [[saved]] = await connection.query('SELECT id FROM roles WHERE role_key=?', [role.key]);
      await connection.query('DELETE FROM role_permissions WHERE role_id=?', [saved.id]);
      for (const permission of role.perms) await connection.query('INSERT INTO role_permissions(role_id,permission_key) VALUES(?,?)', [saved.id, permission]);
    }
    const removable = existing.map(row => row.role_key).filter(key => !keys.has(key));
    if (removable.length) await connection.query('DELETE FROM roles WHERE role_key IN (?)', [removable]);
    await connection.commit();
    return res.json({ success: true, message: 'Roles saved successfully', data: await readRoles() });
  } catch (error) {
    await connection.rollback();
    console.error('Save roles error:', error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Internal server error' });
  } finally { connection.release(); }
};

module.exports = { getRoles, saveRoles };
