const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
async function database(beforeMigration) {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, 'production-schema.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, 'identity.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, 'views.sql'), 'utf8'));
  if (beforeMigration) await beforeMigration(db);
  await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20261022184346_savings_funding_and_traceability.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20261022235107_reconciliation_cases.sql'), 'utf8'));
  return db;
}
module.exports = { database };
if (require.main === module) database().then(async db => { console.log('Schema and migration compiled'); await db.close(); }).catch(e => { console.error(e.message, e.position, e.query?.slice(0,200)); process.exitCode=1; });
