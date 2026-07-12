const pool = require('../config/database');

function isAdmin(req) {
  return String(req.user && req.user.role || '').toLowerCase() === 'admin';
}

function customerDto(row) {
  return {
    id: row.id,
    customer_name: row.customer_name,
    customer_code: row.customer_code,
    customer_branch: row.customer_branch,
    region: row.region,
    timezone: row.timezone,
    inbound_csm_name: row.inbound_csm_name,
    outbound_csm_name: row.outbound_csm_name,
    is_active: row.is_active === 1 || row.is_active === true,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function areaDto(row) {
  return {
    id: row.id,
    area_name: row.area_name,
    area_code: row.area_code,
    is_active: row.is_active === 1 || row.is_active === true,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function makeCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
}

const getMasterData = async (req, res) => {
  try {
    const [customerRows] = await pool.query(
      'SELECT * FROM customers WHERE is_active = 1 ORDER BY customer_name'
    );
    const [areaRows] = await pool.query(
      'SELECT * FROM area WHERE is_active = 1 ORDER BY area_name'
    );
    res.json({
      success: true,
      data: {
        customers: customerRows.map(customerDto),
        areas: areaRows.map(areaDto)
      }
    });
  } catch (error) {
    console.error('Get master data error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const createCustomer = async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
  try {
    const name = String(req.body.customer_name || req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Customer name is required' });
    const code = String(req.body.customer_code || makeCode(name)).trim();
    await pool.query(
      `INSERT INTO customers
       (customer_name, customer_code, customer_branch, region, timezone, inbound_csm_name, outbound_csm_name, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_active = 1,
         customer_branch = COALESCE(VALUES(customer_branch), customer_branch),
         region = COALESCE(VALUES(region), region),
         timezone = COALESCE(VALUES(timezone), timezone),
         inbound_csm_name = COALESCE(VALUES(inbound_csm_name), inbound_csm_name),
         outbound_csm_name = COALESCE(VALUES(outbound_csm_name), outbound_csm_name),
         updated_by = VALUES(updated_by)`,
      [
        name,
        code,
        req.body.customer_branch || null,
        req.body.region || null,
        req.body.timezone || null,
        req.body.inbound_csm_name || null,
        req.body.outbound_csm_name || null,
        req.user.id,
        req.user.id
      ]
    );
    const [rows] = await pool.query('SELECT * FROM customers WHERE customer_code = ? OR customer_name = ? LIMIT 1', [code, name]);
    res.status(201).json({ success: true, data: customerDto(rows[0]) });
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const deactivateCustomer = async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
  try {
    const [refs] = await pool.query('SELECT COUNT(*) AS count FROM incidents WHERE customer_id = ? OR customer = (SELECT customer_name FROM customers WHERE id = ?)', [req.params.id, req.params.id]);
    if (refs[0].count > 0) return res.status(409).json({ success: false, message: 'Customer is referenced by incidents and was not deactivated' });
    await pool.query('UPDATE customers SET is_active = 0, updated_by = ? WHERE id = ?', [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Deactivate customer error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const createArea = async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
  try {
    const name = String(req.body.area_name || req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Area name is required' });
    const code = String(req.body.area_code || makeCode(name)).trim();
    await pool.query(
      `INSERT INTO area (area_name, area_code, created_by, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_active = 1, updated_by = VALUES(updated_by)`,
      [name, code, req.user.id, req.user.id]
    );
    const [rows] = await pool.query('SELECT * FROM area WHERE area_code = ? OR area_name = ? LIMIT 1', [code, name]);
    res.status(201).json({ success: true, data: areaDto(rows[0]) });
  } catch (error) {
    console.error('Create area error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

const deactivateArea = async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'Admin access required' });
  try {
    const [refs] = await pool.query('SELECT COUNT(*) AS count FROM incidents WHERE area_id = ? OR area = (SELECT area_name FROM area WHERE id = ?)', [req.params.id, req.params.id]);
    if (refs[0].count > 0) return res.status(409).json({ success: false, message: 'Area is referenced by incidents and was not deactivated' });
    await pool.query('UPDATE area SET is_active = 0, updated_by = ? WHERE id = ?', [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Deactivate area error:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

module.exports = { getMasterData, createCustomer, deactivateCustomer, createArea, deactivateArea };
