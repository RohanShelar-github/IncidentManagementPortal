'use strict';

// Controlled, repeatable customer Jira-code import. It uses only explicit
// aliases approved by the request; it never performs fuzzy matching or creates
// customer records.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

const backendDir = path.join(__dirname, '..');
dotenv.config({ path: path.join(backendDir, '.env') });
dotenv.config({ path: path.join(backendDir, '.env.local'), override: true });

const mappings = [
  ['National Gypsum', 'NATGYP', ['National Gypsum', 'NGC']],
  ['California Coast Credit Union', 'CCCU', ['California Coast Credit Union', 'CCCU']],
  ['VB Cosmetics', 'VBCOS', ['VB Cosmetics']],
  ['Choctaw Nation', 'CN', ['Choctaw Nation']],
  ['TileBar', 'TIL', ['TileBar']],
  ['MayerElectric', 'MAYER', ['MayerElectric', 'Mayer Electric']],
  ['Intrado', 'IN', ['Intrado']],
  ['SMC', 'SMC', ['SMC']],
  ['Christie Digital', 'CD', ['Christie Digital']],
  ['Toridoll', 'TOR', ['Toridoll']],
  ['TCP', 'TCP', ['TCP', 'TCP - Shields Harper']],
  ['BWC', 'BWC', ['BWC']],
  ['Ramat-Gan Municipality', 'RGM', ['Ramat-Gan Municipality']],
  ['Prettl Holding', 'PRT', ['Prettl Holding', 'Prettl']],
  ['MSE US', 'MSEUS', ['MSE US']],
  ['CSO-MIS', 'CSOMIS', ['CSO-MIS']],
  ['Ives Bank', 'IB', ['Ives Bank']],
  ['Georg Jos. Kaes GmbH', 'GJKG', ['Georg Jos. Kaes GmbH']],
  ['San Diego Airport', 'SDA', ['San Diego Airport']]
];

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[\s_-]+/g, ' ');
}

function reportPath() {
  const reportsDir = path.join(backendDir, 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  return path.join(reportsDir, `customer-jira-project-code-import-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
}

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'incident_management_db'
  });
  const report = { generated_at: new Date().toISOString(), matched: [], updated: [], unchanged: [], not_found: [], ambiguous: [], errors: [] };
  try {
    const [columns] = await connection.query("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'jira_project_code'");
    if (!columns.length) throw new Error('jira_project_code field is missing. Run migration 022 first.');
    const [customers] = await connection.query('SELECT id, customer_name, jira_project_code FROM customers');

    const plans = mappings.map(([sourceName, jiraProjectCode, aliases]) => {
      const aliasSet = new Set(aliases.map(normalize));
      const candidates = customers.filter((customer) => aliasSet.has(normalize(customer.customer_name)));
      if (!candidates.length) report.not_found.push({ source_name: sourceName, jira_project_code: jiraProjectCode });
      else if (candidates.length > 1) report.ambiguous.push({ source_name: sourceName, jira_project_code: jiraProjectCode, candidates: candidates.map((customer) => ({ id: customer.id, customer_name: customer.customer_name })) });
      else report.matched.push({ source_name: sourceName, customer_id: candidates[0].id, customer_name: candidates[0].customer_name, jira_project_code: jiraProjectCode });
      return { sourceName, jiraProjectCode, candidates };
    });

    await connection.beginTransaction();
    try {
      for (const plan of plans) {
        if (plan.candidates.length !== 1) continue;
        const customer = plan.candidates[0];
        const previous = customer.jira_project_code == null ? null : String(customer.jira_project_code);
        if (previous === plan.jiraProjectCode) {
          report.unchanged.push({ customer_id: customer.id, customer_name: customer.customer_name, jira_project_code: previous });
          continue;
        }
        await connection.query('UPDATE customers SET jira_project_code = ? WHERE id = ?', [plan.jiraProjectCode, customer.id]);
        await connection.query('INSERT INTO customer_jira_project_code_audit (customer_id, customer_name, previous_jira_project_code, new_jira_project_code) VALUES (?, ?, ?, ?)', [customer.id, customer.customer_name, previous, plan.jiraProjectCode]);
        report.updated.push({ customer_id: customer.id, customer_name: customer.customer_name, previous_jira_project_code: previous, new_jira_project_code: plan.jiraProjectCode });
      }
      if (report.errors.length) throw new Error('Validation errors prevented import.');
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error) {
    report.errors.push(error.message);
    process.exitCode = 1;
  } finally {
    report.summary = {
      source_mappings: mappings.length, customers_matched: report.matched.length,
      customers_updated: report.updated.length, already_correct: report.unchanged.length,
      customers_not_found: report.not_found.length, ambiguous_matches: report.ambiguous.length,
      errors: report.errors.length
    };
    const output = reportPath();
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report.summary, report_file: output }, null, 2));
    await connection.end();
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
