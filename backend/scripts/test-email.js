'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });
const { configured, sendIncidentCreatedEmail } = require('../services/emailService');

async function main() {
  if (!configured()) throw new Error('Email is not configured');
  const result = await sendIncidentCreatedEmail({
    id: 'EMAIL-TEST',
    title: 'AOC 24×7 Gmail SMTP configuration test',
    severity: 'Normal',
    status: 'Test',
    customer: 'Internal',
    project: 'Incident Management Portal',
    area: 'Email Notification',
    engineer: 'AOC Team',
    startDT: new Date().toISOString(),
    timezone: 'IST',
    description: 'This test confirms that automatic incident email delivery is working.'
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
