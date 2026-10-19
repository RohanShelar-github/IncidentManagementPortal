'use strict';

const pool = require('../config/database');

const SETTING_KEY = 'dashboard_layout';
const MAX_CARDS = 100;

const getDashboardLayout = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1', [SETTING_KEY]);
    res.json({ success: true, data: rows.length ? rows[0].setting_value : null });
  } catch (error) {
    console.error('Get dashboard layout error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to load the dashboard layout' });
  }
};

const saveDashboardLayout = async (req, res) => {
  try {
    const order = req.body && Array.isArray(req.body.order) ? req.body.order : null;
    if (!order || !order.length) {
      return res.status(400).json({ success: false, message: 'A non-empty card order list is required' });
    }
    if (order.length > MAX_CARDS || !order.every((id) => typeof id === 'string' && id.trim() && id.length <= 100)) {
      return res.status(400).json({ success: false, message: 'Invalid card order list' });
    }

    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [SETTING_KEY, JSON.stringify(order), req.user.id]
    );
    res.json({ success: true, message: 'Dashboard layout saved', data: order });
  } catch (error) {
    console.error('Save dashboard layout error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to save the dashboard layout' });
  }
};

module.exports = { getDashboardLayout, saveDashboardLayout };
