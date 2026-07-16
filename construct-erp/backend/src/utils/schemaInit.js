const logger = require('./logger');

let queue = Promise.resolve();
let tableReady = false;

// Tracks which named schema-init tasks (including one-off data migrations)
// have already run, so `task()` executes exactly once ever instead of on
// every server boot. Previously `name` was only used for log messages —
// nothing prevented a migration from re-scanning/re-mutating tables like
// tqs_bills on every restart; safety relied entirely on each task's own WHERE
// clause happening to be self-excluding after the first run.
async function ensureMigrationsTable() {
  if (tableReady) return;
  const { query } = require('../config/database');
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(200) PRIMARY KEY,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  tableReady = true;
}

const runSchemaInit = (name, task) => {
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_SCHEMA_INIT === 'true') {
    return Promise.resolve();
  }

  queue = queue
    .then(async () => {
      const { query } = require('../config/database');
      await ensureMigrationsTable();
      const { rows } = await query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (rows.length) return; // already applied — never re-run

      await task();
      await query(
        'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [name]
      );
    })
    .catch((err) => {
      logger.warn(`[schema-init] ${name} skipped: ${err.message}`);
    });

  return queue;
};

module.exports = { runSchemaInit };
