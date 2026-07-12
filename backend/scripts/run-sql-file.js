require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function splitSql(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';
  for (const rawLine of sql.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^DELIMITER\s+/i.test(line)) {
      delimiter = line.split(/\s+/)[1];
      continue;
    }
    buffer += rawLine + '\n';
    if (buffer.trimEnd().endsWith(delimiter)) {
      const statement = buffer.trimEnd().slice(0, -delimiter.length).trim();
      if (statement && !statement.startsWith('--')) statements.push(statement);
      buffer = '';
    }
  }
  const tail = buffer.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/run-sql-file.js <path-to-sql>');
  const sql = fs.readFileSync(path.resolve(file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: false
  });
  for (const statement of splitSql(sql)) {
    await connection.query(statement);
  }
  await connection.end();
  console.log('Executed ' + file);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
