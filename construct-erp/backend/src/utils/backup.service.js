const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const logger = require('./logger');

const getPgDumpPath = () => {
  if (process.env.PG_DUMP_PATH) return process.env.PG_DUMP_PATH;

  if (process.platform === 'win32') {
    const pgRoot = 'C:\\Program Files\\PostgreSQL';
    try {
      if (fs.existsSync(pgRoot)) {
        const versions = fs.readdirSync(pgRoot)
          .filter(name => /^\d+$/.test(name))
          .sort((a, b) => Number(b) - Number(a));
        for (const version of versions) {
          const candidate = path.join(pgRoot, version, 'bin', 'pg_dump.exe');
          if (fs.existsSync(candidate)) return candidate;
        }
      }
    } catch (err) {
      logger.warn(`Could not auto-detect pg_dump: ${err.message}`);
    }
  }

  return 'pg_dump';
};

const PG_DUMP_PATH = getPgDumpPath();
// BACKUP_DIR is set to /app/backups in docker-compose (named volume — survives restarts).
// Falls back to a local path for development.
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../../../backups');

/**
 * Perform a database backup using pg_dump
 */
const performBackup = () => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `backup_${timestamp}.sql`;
    const filePath = path.join(BACKUP_DIR, fileName);

    logger.info(`💾 Starting automated database backup: ${fileName}...`);

    const env = {
      ...process.env,
      PGPASSWORD: process.env.DB_PASSWORD
    };

    const dump = spawn(PG_DUMP_PATH, [
      '-h', process.env.DB_HOST || 'localhost',
      '-p', process.env.DB_PORT || '5432',
      '-U', process.env.DB_USER || 'postgres',
      '-f', filePath,
      process.env.DB_NAME || 'construct_erp'
    ], { env });

    dump.stdout.on('data', (data) => {
      // logger.debug(`pg_dump: ${data}`);
    });

    dump.stderr.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('checking version')) {
        logger.warn(`pg_dump warning: ${msg}`);
      }
    });

    dump.on('error', (err) => {
      logger.error(`Backup failed to start. pg_dump path "${PG_DUMP_PATH}" is not available: ${err.message}`);
      reject(err);
    });

    dump.on('close', (code) => {
      if (code !== 0) {
        logger.error(`❌ pg_dump process exited with code ${code}`);
        reject(new Error(`pg_dump failed with code ${code}`));
        return;
      }

      // A zero exit code doesn't guarantee a usable dump — a disk-full or
      // network drop mid-dump can still produce a truncated/empty file with
      // exit code 0. Verify the file exists, has real content, and ends with
      // pg_dump's standard footer before trusting it.
      let stats;
      try {
        stats = fs.statSync(filePath);
      } catch (err) {
        logger.error(`❌ Backup file missing after pg_dump reported success: ${filePath}`);
        reject(new Error('Backup file missing after pg_dump reported success'));
        return;
      }

      const MIN_BACKUP_BYTES = 1024; // a real dump of this schema is always far larger than 1KB
      if (stats.size < MIN_BACKUP_BYTES) {
        logger.error(`❌ Backup file suspiciously small (${stats.size} bytes): ${filePath}`);
        reject(new Error(`Backup file too small (${stats.size} bytes) — likely truncated`));
        return;
      }

      const tail = fs.readFileSync(filePath, 'utf8').slice(-2000);
      if (!tail.includes('PostgreSQL database dump complete')) {
        logger.error(`❌ Backup file missing completion footer — dump likely truncated: ${filePath}`);
        reject(new Error('Backup file missing pg_dump completion footer — likely truncated'));
        return;
      }

      logger.info(`✅ Backup successful and verified (${(stats.size / 1024).toFixed(1)} KB): ${filePath}`);
      rotateBackups();
      resolve(filePath);
    });
  });
};

/**
 * Delete backups older than 7 days
 */
const rotateBackups = () => {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const expiry = 7 * 24 * 60 * 60 * 1000; // 7 days

    files.forEach(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > expiry) {
        fs.unlinkSync(filePath);
        logger.info(`🗑️ Rotated old backup: ${file}`);
      }
    });
  } catch (err) {
    logger.error(`Error rotating backups: ${err.message}`);
  }
};

const getLatestBackupAgeMs = () => {
  if (!fs.existsSync(BACKUP_DIR)) return Infinity;

  const latestBackup = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith('.sql'))
    .map(file => fs.statSync(path.join(BACKUP_DIR, file)).mtimeMs)
    .sort((a, b) => b - a)[0];

  return latestBackup ? Date.now() - latestBackup : Infinity;
};

/**
 * Initialize the backup schedule
 */
const initBackupService = () => {
  // Schedule: Every day at 02:00 AM
  cron.schedule('0 2 * * *', () => {
    logger.info('⏰ Scheduled backup triggered...');
    performBackup().catch(err => {
      logger.error(`Scheduled backup failed: ${err.message}`);
    });
  });

  logger.info('🛡️ Automated Backup Service initialized (Schedule: 02:00 AM daily, Retention: 7 days)');
  
  // Run a safety backup on startup if the folder is empty or the latest backup is stale.
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const latestAgeMs = getLatestBackupAgeMs();
    const staleAfterMs = 26 * 60 * 60 * 1000;
    if (latestAgeMs === Infinity || latestAgeMs > staleAfterMs) {
      logger.info('🚀 First run: Triggering initial safety backup...');
      performBackup().catch(err => logger.error(`Startup safety backup failed: ${err.message}`));
    }
  } catch (err) {
    logger.warn(`Could not check backup directory: ${err.message}`);
  }
};

module.exports = {
  performBackup,
  initBackupService
};
