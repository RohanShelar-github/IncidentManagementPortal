'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const apiRoot = process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 4000}/api`;
let createdIncidentRef = null;
let token = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(method, route, body) {
  const response = await fetch(`${apiRoot}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${method} ${route} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function cleanup() {
  if (!createdIncidentRef || !token) return;
  try {
    await request('DELETE', `/incidents/${encodeURIComponent(createdIncidentRef)}`);
  } catch (error) {
    console.error(`Cleanup warning for ${createdIncidentRef}: ${error.message}`);
  }
  createdIncidentRef = null;
}

async function main() {
  const [[user]] = await pool.query(
    `SELECT id, email, full_name, role
       FROM users
      ORDER BY id
      LIMIT 1`
  );
  const [[customer]] = await pool.query(
    `SELECT id, customer_name AS name
       FROM customers
      ORDER BY id
      LIMIT 1`
  );
  const [[area]] = await pool.query(
    `SELECT id, area_name AS name
       FROM area
      ORDER BY id
      LIMIT 1`
  );

  assert(user, 'No active user is available for authenticated validation.');
  assert(customer, 'No customer is available for incident validation.');
  assert(area, 'No area is available for incident validation.');

  token = jwt.sign(
    { id: user.id, email: user.email, name: user.full_name, role: user.role },
    process.env.JWT_SECRET || 'change_this_secret_in_production',
    { expiresIn: '10m' }
  );

  const [staleRows] = await pool.query(
    `SELECT incident_ref
       FROM incidents
      WHERE title LIKE 'Normalization API validation %'
        AND description = 'Temporary automated normalization validation incident.'`
  );
  for (const stale of staleRows) {
    await request('DELETE', `/incidents/${encodeURIComponent(stale.incident_ref)}`);
  }

  const marker = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const createResult = await request('POST', '/incidents', {
    title: `Normalization API validation ${marker}`,
    description: 'Temporary automated normalization validation incident.',
    severity: 'Medium',
    status: 'New',
    engineer: user.full_name,
    customer: customer.name,
    customer_id: customer.id,
    project: 'Normalization Validation',
    area: area.name,
    area_id: area.id,
    timezone: 'Asia/Kolkata',
    startDT: '2026-07-27 10:00:00',
    mttd_minutes: 12,
    mttr_minutes: 30,
    downtime_mins: 0
  });

  createdIncidentRef = createResult.data?.id;
  assert(createdIncidentRef, 'Incident creation did not return an incident reference.');

  await request('PUT', `/incidents/${encodeURIComponent(createdIncidentRef)}`, {
    assignedTo: user.full_name,
    customer: customer.name,
    customer_id: customer.id,
    area: area.name,
    area_id: area.id,
    timezone: 'Asia/Kolkata',
    startDT: '2026-07-27 10:00:00',
    mttd_minutes: 12,
    mttr_minutes: 30
  });

  await request('PUT', `/incidents/${encodeURIComponent(createdIncidentRef)}`, {
    status: 'Closed',
    incident_report_status: 'Yes',
    timezone: 'Asia/Kolkata',
    startDT: '2026-07-27 10:00:00',
    endDT: '2026-07-27 11:05:00',
    downtime_mins: 65,
    mttr_minutes: 42,
    mttd_minutes: 12
  });

  const closed = await request('GET', `/incidents/${encodeURIComponent(createdIncidentRef)}`);
  assert(closed.data, 'Closed incident could not be read back.');
  assert(closed.data.downtime_mins === 65, 'Canonical downtime was not persisted.');
  assert(closed.data.downtimeH === 1 && closed.data.downtimeM === 5,
    'Legacy downtime aliases do not match canonical downtime.');
  assert(closed.data.mttr_minutes === 42, 'Canonical MTTR was not persisted.');
  assert(closed.data.mttrH === 0 && closed.data.mttrM === 42,
    'Legacy MTTR aliases do not match canonical MTTR.');
  assert(closed.data.mttd_minutes === 12, 'Canonical MTTD was not persisted.');
  assert(closed.data.opened_at_utc && closed.data.closed_at_utc,
    'Canonical UTC timestamps were not persisted.');
  assert(closed.data.source_timezone === 'Asia/Kolkata',
    'IANA source timezone was not persisted.');
  assert(Object.hasOwn(closed.data, 'customer') && Object.hasOwn(closed.data, 'area'),
    'Existing API aliases are missing.');

  await request('PUT', `/incidents/${encodeURIComponent(createdIncidentRef)}`, {
    status: 'New'
  });
  const reopened = await request('GET', `/incidents/${encodeURIComponent(createdIncidentRef)}`);
  assert(reopened.data.status === 'New', 'Incident reopening did not preserve the API status contract.');

  const list = await request('GET', '/incidents?limit=5');
  assert(Array.isArray(list.data), 'Incident list contract is invalid.');
  const stats = await request('GET', '/incidents/stats/dashboard');
  assert(stats.data && Number.isFinite(Number(stats.data.total)), 'Incident stats contract is invalid.');

  const result = {
    passed: true,
    lifecycle: ['create', 'assign/update', 'close', 'read', 'reopen', 'list', 'stats', 'cleanup'],
    verified: [
      'legacy API aliases',
      'canonical downtime',
      'canonical MTTD',
      'canonical MTTR',
      'canonical UTC timestamps',
      'IANA timezone'
    ]
  };

  await cleanup();
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(async error => {
    await cleanup();
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
