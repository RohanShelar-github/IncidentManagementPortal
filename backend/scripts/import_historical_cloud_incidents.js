const fs = require('fs');
const path = require('path');
const pool = require('../config/database');

const XLSX_XL_DIR = path.resolve(__dirname, '..', '..', '.tmp_import_cloud_incidents', 'xlsx', 'xl');
const SOURCE_NAME = "Cloud Incidents from Jan'26 to May'26.xlsx";
const LEGACY_SOURCE = 'historical_cloud_incidents_jan_may_2026';

function decodeXml(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
function colName(ref) { return (ref.match(/[A-Z]+/) || [''])[0]; }
function colNum(col) { let n = 0; for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function clean(value) { return String(value ?? '').trim(); }
function normKey(value) { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function codeFor(value, fallback) {
  const code = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').substring(0, 45);
  return code || fallback;
}
function excelSerialToDateTime(value) {
  const raw = clean(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.replace('T', ' ').substring(0, 19).padEnd(19, ':00').replace(/:00:00$/, ':00');
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = Math.round(n * 86400000);
  const d = new Date(epoch + ms);
  const pad = (x) => String(x).padStart(2, '0');
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
}
function excelSerialToDate(value) {
  const dt = excelSerialToDateTime(value);
  return dt ? dt.substring(0, 10) : null;
}
function minutesToStr(total) {
  const n = Number(total);
  if (!Number.isFinite(n) || n <= 0) return null;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}
function normalizeSeverity(value, review) {
  const v = clean(value);
  const k = v.toLowerCase();
  if (k === 'critical') return 'critical';
  if (k === 'high') return 'high';
  if (k === 'medium') return 'medium';
  if (k === 'low') {
    review.transformations.lowSeverityToNormal += 1;
    return 'normal';
  }
  if (k === 'normal') return 'normal';
  review.manual.push({ type: 'severity', value: v, action: 'Defaulted to medium' });
  return 'medium';
}
function normalizeStatus(value, review) {
  const v = clean(value);
  const k = v.toLowerCase();
  if (!v || k === 'closed') return 'closed';
  if (k.includes('tier 3') || k.includes('qa')) {
    review.transformations.tier3QaToThirdParty += 1;
    review.manual.push({ type: 'status', value: v, action: 'Mapped to escalated_to_3rd_party' });
    return 'escalated_to_3rd_party';
  }
  if (k.includes('progress')) return 'in_progress';
  if (k.includes('resolved')) return 'resolved';
  review.manual.push({ type: 'status', value: v, action: 'Defaulted to closed' });
  return 'closed';
}
function normalizeReportStatus(value, review, caseNumber) {
  const v = clean(value);
  if (/^yes$/i.test(v)) return 'Yes';
  if (/^no$/i.test(v)) return 'No';
  if (v) review.manual.push({ type: 'incident_report_status', caseNumber, value: v, action: 'Stored as null; expected Yes or No' });
  return null;
}
function parseSharedStrings() {
  const p = path.join(XLSX_XL_DIR, 'sharedStrings.xml');
  if (!fs.existsSync(p)) return [];
  const xml = fs.readFileSync(p, 'utf8');
  const values = [];
  for (const m of xml.matchAll(/<si[\s\S]*?<\/si>/g)) {
    values.push([...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1])).join(''));
  }
  return values;
}
function parseWorkbook() {
  const shared = parseSharedStrings();
  const wb = fs.readFileSync(path.join(XLSX_XL_DIR, 'workbook.xml'), 'utf8');
  const rels = fs.readFileSync(path.join(XLSX_XL_DIR, '_rels', 'workbook.xml.rels'), 'utf8');
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  const sheets = [];
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    sheets.push({ name: decodeXml(m[1]), target: relMap[m[3]] });
  }
  function cellValue(cell) {
    const t = (cell.match(/ t="([^"]+)"/) || [])[1];
    const v = (cell.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
    if (t === 's') return shared[Number(v)] || '';
    if (t === 'inlineStr') return [...cell.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => decodeXml(x[1])).join('');
    return v === undefined ? '' : decodeXml(v);
  }
  function parseSheet(target) {
    const xml = fs.readFileSync(path.join(XLSX_XL_DIR, target), 'utf8');
    const rows = [];
    for (const rm of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const vals = [];
      for (const cm of rm[2].matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*>[\s\S]*?<\/c>/g)) vals[colNum(colName(cm[1])) - 1] = cellValue(cm[0]);
      if (vals.some((v) => clean(v))) rows.push({ rowNumber: Number(rm[1]), vals });
    }
    return rows;
  }
  const bySheet = {};
  for (const sh of sheets) {
    const rows = parseSheet(sh.target);
    const headers = rows[0].vals.map((x) => clean(x));
    bySheet[sh.name] = rows.slice(1).map((r) => {
      const obj = { _sheet: sh.name, _rowNumber: r.rowNumber };
      headers.forEach((h, i) => { obj[h] = r.vals[i] ?? ''; });
      return obj;
    });
  }
  return bySheet;
}
async function findOrCreateCustomer(conn, name, accountName, createdBy, report) {
  const customerName = clean(name) || clean(accountName) || 'Unknown Customer';
  const aliases = { ramatgan: 'Ramat-Gan Municipality' };
  const lookupName = aliases[normKey(customerName).replace(/ /g, '')] || customerName;
  const [rows] = await conn.query('SELECT id, customer_name FROM customers WHERE LOWER(customer_name) = LOWER(?) OR LOWER(customer_code) = LOWER(?) LIMIT 1', [lookupName, codeFor(lookupName, 'customer')]);
  if (rows.length) return { id: rows[0].id, name: rows[0].customer_name };
  let code = codeFor(customerName, 'customer');
  const [sameCode] = await conn.query('SELECT id FROM customers WHERE customer_code = ? LIMIT 1', [code]);
  if (sameCode.length) code = (code + '_' + Math.abs(hashCode(customerName))).substring(0, 50);
  await conn.query('INSERT INTO customers (customer_name, customer_code, created_by, updated_by, is_active) VALUES (?, ?, ?, ?, 1)', [customerName, code, createdBy, createdBy]);
  const [created] = await conn.query('SELECT id, customer_name FROM customers WHERE customer_code = ? LIMIT 1', [code]);
  report.createdCustomers.push(customerName);
  return { id: created[0].id, name: created[0].customer_name };
}
async function findOrCreateArea(conn, name, createdBy, report) {
  const raw = clean(name) || 'Unspecified';
  const normalized = raw.toLowerCase() === 'infrastructure' ? 'Infrastructure' : raw;
  const [rows] = await conn.query('SELECT id, area_name FROM area WHERE LOWER(area_name) = LOWER(?) OR LOWER(area_code) = LOWER(?) LIMIT 1', [normalized, codeFor(normalized, 'area').toUpperCase()]);
  if (rows.length) return { id: rows[0].id, name: rows[0].area_name };
  let code = codeFor(normalized, 'area').toUpperCase().substring(0, 20);
  const [sameCode] = await conn.query('SELECT id FROM area WHERE area_code = ? LIMIT 1', [code]);
  if (sameCode.length) code = (code + '_' + Math.abs(hashCode(normalized))).substring(0, 20);
  await conn.query('INSERT INTO area (area_name, area_code, created_by, updated_by, is_active) VALUES (?, ?, ?, ?, 1)', [normalized, code, createdBy, createdBy]);
  const [created] = await conn.query('SELECT id, area_name FROM area WHERE area_code = ? LIMIT 1', [code]);
  report.createdAreas.push(normalized);
  return { id: created[0].id, name: created[0].area_name };
}
function hashCode(s) { let h = 0; for (const ch of String(s)) h = ((h << 5) - h + ch.charCodeAt(0)) | 0; return h; }
async function main() {
  if (!fs.existsSync(XLSX_XL_DIR)) throw new Error('Expanded workbook directory not found: ' + XLSX_XL_DIR);
  const bySheet = parseWorkbook();
  const sheet2 = bySheet.Sheet2 || [];
  const cloud = bySheet['Cloud Incidents'] || [];
  const sheet2Cases = new Set(sheet2.map((r) => clean(r['Case Number'])).filter(Boolean));
  const rows = sheet2.concat(cloud.filter((r) => !sheet2Cases.has(clean(r['Case Number']))));
  const unique = [];
  const sourceDup = [];
  const seen = new Set();
  for (const row of rows) {
    const caseNo = clean(row['Case Number']);
    if (!caseNo) continue;
    if (seen.has(caseNo)) sourceDup.push({ caseNumber: caseNo, sheet: row._sheet, rowNumber: row._rowNumber });
    else { seen.add(caseNo); unique.push(row); }
  }
  const conn = await pool.getConnection();
  const report = {
    sourceFile: SOURCE_NAME,
    sourceSheets: Object.fromEntries(Object.entries(bySheet).map(([k, v]) => [k, v.length])),
    selectedSource: 'Sheet2 plus unique rows from Cloud Incidents',
    totalProcessed: unique.length,
    inserted: 0,
    skippedDuplicates: [],
    sourceDuplicates: sourceDup,
    manual: [],
    createdCustomers: [],
    createdAreas: [],
    transformations: { lowSeverityToNormal: 0, tier3QaToThirdParty: 0, ownerAliases: [] },
    mapping: {
      'Case Number': 'legacy_case_number, sf_case_no',
      Customer: 'customer, customer_id',
      'Project Area/Project': 'project, project_area',
      Area: 'area, area_id',
      'Product Line': 'product_line',
      'Date/Time Closed': 'date_time_closed, end_dt',
      'Case Owner': 'case_owner, assigned_to when exact/alias user match exists',
      'Closed Date': 'closed_date',
      Severity: 'severity',
      Subject: 'title, description',
      'Incident Report status': 'incident_report_status',
      'Downtime(Mins)': 'downtime_mins, downtime_hours, downtime_minutes, downtime_str',
      'Mean Time to Detect (MTTD)': 'mttd_minutes, mttd_str',
      Resolution: 'resolution',
      'Date/Time Opened': 'date_time_opened, start_dt',
      Month: 'legacy_month',
      'Account Name': 'account_name',
      'Internal Status': 'internal_status, status',
      'R&D Tickets': 'rd_tickets',
      'Full source row': 'legacy_raw'
    }
  };
  try {
    await conn.beginTransaction();
    const [adminRows] = await conn.query("SELECT id FROM users WHERE email = 'rohan_shelar@magicsoftware.com' OR role = 'admin' ORDER BY email = 'rohan_shelar@magicsoftware.com' DESC, id LIMIT 1");
    if (!adminRows.length) throw new Error('No admin user found for created_by');
    const createdBy = adminRows[0].id;
    const [userRows] = await conn.query('SELECT id, full_name FROM users');
    const userByName = new Map(userRows.map((u) => [normKey(u.full_name), u]));
    const ownerAliases = { [normKey('Sushant Tadke')]: normKey('Shushant Tadke') };
    const [maxRows] = await conn.query("SELECT MAX(CAST(SUBSTRING_INDEX(incident_ref, '-', -1) AS UNSIGNED)) AS max_num FROM incidents WHERE incident_ref LIKE 'INC-%'");
    let nextRef = Number(maxRows[0].max_num || 0) + 1;
    for (const row of unique) {
      const caseNo = clean(row['Case Number']);
      const [dups] = await conn.query('SELECT incident_ref FROM incidents WHERE sf_case_no = ? OR legacy_case_number = ? LIMIT 1', [caseNo, caseNo]);
      if (dups.length) { report.skippedDuplicates.push({ caseNumber: caseNo, existingIncidentRef: dups[0].incident_ref }); continue; }
      const accountName = clean(row['Account Name']);
      const customer = await findOrCreateCustomer(conn, row.Customer, accountName, createdBy, report);
      const area = await findOrCreateArea(conn, row.Area, createdBy, report);
      const owner = clean(row['Case Owner']);
      let assignedTo = null;
      let ownerKey = normKey(owner);
      if (ownerAliases[ownerKey]) {
        report.transformations.ownerAliases.push({ source: owner, mappedTo: userByName.get(ownerAliases[ownerKey])?.full_name || ownerAliases[ownerKey] });
        ownerKey = ownerAliases[ownerKey];
      }
      if (userByName.has(ownerKey)) assignedTo = userByName.get(ownerKey).id;
      else if (owner) report.manual.push({ type: 'case_owner', caseNumber: caseNo, value: owner, action: 'Preserved in case_owner; assigned_to left null because no unambiguous user match exists' });
      const openedAt = excelSerialToDateTime(row['Date/Time Opened']);
      const closedAt = excelSerialToDateTime(row['Date/Time Closed']);
      const closedDate = excelSerialToDate(row['Closed Date']) || (closedAt ? closedAt.substring(0, 10) : null);
      if (!openedAt) report.manual.push({ type: 'date_time_opened', caseNumber: caseNo, value: row['Date/Time Opened'], action: 'Stored null' });
      const downtimeTotal = Math.max(0, Math.round(Number(clean(row['Downtime(Mins)'])) || 0));
      const mttd = clean(row['Mean Time to Detect (MTTD)']);
      const mttdMinutes = mttd === '' ? null : Math.round(Number(mttd));
      if (mttd !== '' && !Number.isFinite(mttdMinutes)) report.manual.push({ type: 'mttd', caseNumber: caseNo, value: mttd, action: 'Stored null' });
      const project = clean(row['Project Area'] || row.Project);
      const status = normalizeStatus(row['Internal Status'], report);
      const severity = normalizeSeverity(row.Severity, report);
      const reportStatus = normalizeReportStatus(row['Incident Report status'], report, caseNo);
      const incidentRef = 'INC-' + String(nextRef++).padStart(3, '0');
      const legacyRaw = JSON.stringify(row);
      await conn.query(
        `INSERT INTO incidents
        (incident_ref, legacy_case_number, title, description, severity, status, assigned_to, case_owner, created_by,
         customer_id, customer, project, project_area, area_id, area, product_line, components, applications, sla_hours, tags,
         start_dt, date_time_opened, end_dt, date_time_closed, closed_date, timezone, downtime_hours, downtime_minutes, downtime_mins,
         downtime_str, rca, resolution, resolved_by, sf_case_no, incident_report_status, mttd_str, mttd_minutes, legacy_month,
         account_name, internal_status, rd_tickets, legacy_source, legacy_raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
        [
          incidentRef, caseNo, clean(row.Subject) || ('Historical incident ' + caseNo), clean(row.Subject) || null, severity, status,
          assignedTo, owner || null, createdBy, customer.id, customer.name, project || null, project || null, area.id, area.name,
          clean(row['Product Line']) || null, null, null, null, JSON.stringify(['historical-import']), openedAt, openedAt, closedAt, closedAt,
          closedDate, 'IST', Math.floor(downtimeTotal / 60), downtimeTotal % 60, downtimeTotal, minutesToStr(downtimeTotal), null,
          clean(row.Resolution) || null, null, caseNo, reportStatus, minutesToStr(mttdMinutes), Number.isFinite(mttdMinutes) ? mttdMinutes : null,
          clean(row.Month) || null, accountName || null, clean(row['Internal Status']) || null, clean(row['R&D Tickets']) || null,
          LEGACY_SOURCE, legacyRaw
        ]
      );
      report.inserted += 1;
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
  report.createdCustomers = [...new Set(report.createdCustomers)].sort();
  report.createdAreas = [...new Set(report.createdAreas)].sort();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportsDir = path.resolve(__dirname, '..', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const jsonPath = path.join(reportsDir, `historical_incident_import_report_${stamp}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  const md = [
    '# Historical Incident Import Report',
    '',
    `Source: ${report.sourceFile}`,
    `Selected source: ${report.selectedSource}`,
    '',
    '## Summary',
    `- Total incidents processed: ${report.totalProcessed}`,
    `- Total incidents inserted: ${report.inserted}`,
    `- Skipped duplicate records: ${report.skippedDuplicates.length}`,
    `- Source duplicate records: ${report.sourceDuplicates.length}`,
    `- Created customer master rows: ${report.createdCustomers.length}`,
    `- Created area master rows: ${report.createdAreas.length}`,
    `- Manual review items: ${report.manual.length}`,
    '',
    '## Transformations',
    `- Low severity mapped to Normal: ${report.transformations.lowSeverityToNormal}`,
    `- Escalated to Tier 3 QA mapped to Escalated to 3rd Party: ${report.transformations.tier3QaToThirdParty}`,
    `- Owner aliases applied: ${report.transformations.ownerAliases.length}`,
    '',
    '## Created Customers',
    ...(report.createdCustomers.length ? report.createdCustomers.map((x) => `- ${x}`) : ['- None']),
    '',
    '## Created Areas',
    ...(report.createdAreas.length ? report.createdAreas.map((x) => `- ${x}`) : ['- None']),
    '',
    '## Manual Review',
    ...(report.manual.length ? report.manual.slice(0, 200).map((x) => `- ${x.type}${x.caseNumber ? ' ' + x.caseNumber : ''}: ${x.value} -> ${x.action}`) : ['- None']),
    '',
    `JSON detail report: ${jsonPath}`,
    ''
  ].join('\n');
  const mdPath = jsonPath.replace(/\.json$/, '.md');
  fs.writeFileSync(mdPath, md);
  console.log(JSON.stringify({ report: mdPath, jsonReport: jsonPath, summary: { processed: report.totalProcessed, inserted: report.inserted, skippedDuplicates: report.skippedDuplicates.length, manualReview: report.manual.length, createdCustomers: report.createdCustomers.length, createdAreas: report.createdAreas.length } }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });

