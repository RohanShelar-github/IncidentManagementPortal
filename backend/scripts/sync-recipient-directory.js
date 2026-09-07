const dotenv = require('dotenv');
const path = require('path');
const environmentDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(environmentDir, '.env') });
dotenv.config({ path: path.join(environmentDir, '.env.local'), override: true });

const pool = require('../config/database');

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function displayName(email) {
  return String(email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function upsert(rows, isPortalUser) {
  if (!rows.length) return;
  const update = isPortalUser
    ? 'display_name = VALUES(display_name), is_portal_user = 1, is_active = 1'
    : "display_name = IF(display_name IS NULL OR display_name = '', VALUES(display_name), display_name), is_customer_recipient = 1, is_active = 1";
  await pool.query(`INSERT INTO email_recipient_directory (email, display_name, is_portal_user, is_customer_recipient) VALUES ? ON DUPLICATE KEY UPDATE ${update}`, [rows]);
}

async function main() {
  const [[users], [configs]] = await Promise.all([
    pool.query("SELECT email, full_name FROM users WHERE is_active = 1 AND email IS NOT NULL AND email <> ''"),
    pool.query('SELECT to_recipients, cc_recipients FROM customer_email_recipient_configs WHERE is_enabled = 1 AND effective_date <= CURDATE()')
  ]);
  const userRows = users.filter((user) => validEmail(user.email)).map((user) => [String(user.email).trim().toLowerCase(), String(user.full_name || '').trim(), 1, 0]);
  const configured = new Set();
  configs.forEach((config) => {
    [config.to_recipients, config.cc_recipients].forEach((list) => String(list || '').split(',').forEach((value) => {
      const email = String(value || '').trim().toLowerCase();
      if (validEmail(email)) configured.add(email);
    }));
  });
  await upsert(userRows, true);
  await upsert(Array.from(configured).map((email) => [email, displayName(email), 0, 1]), false);
  const [summary] = await pool.query(`
    SELECT COUNT(*) AS total,
           SUM(is_portal_user = 1) AS portal_users,
           SUM(is_customer_recipient = 1) AS customer_recipients
      FROM email_recipient_directory
     WHERE is_active = 1
  `);
  console.log(JSON.stringify(summary[0]));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exit(1);
});
